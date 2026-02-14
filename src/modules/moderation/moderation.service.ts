import { prisma } from '@/shared/utils/prisma';
import { logger } from '@/shared/utils/logger';
import { containsBannedWords } from './banned-words';
import {
  ModerationResult,
  ModerationRequest,
  ModerationConfig,
  ModerationStatus,
  ModerationKind,
} from './moderation.types';

export class ModerationService {
  private config: ModerationConfig;
  private userMessageCounts: Map<string, number[]>; // userId -> array of timestamps

  constructor() {
    this.config = {
      enabled: process.env.MODERATION_ENABLED !== 'false', // Enabled by default
      bannedWords: [], // Loaded from banned-words.ts
      maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH) || 5000,
      maxMessagesPerMinute: Number(process.env.MAX_MESSAGES_PER_MINUTE) || 10,
      blockOnMatch: true,
    };

    this.userMessageCounts = new Map();

    logger.info({ config: this.config }, 'Moderation service initialized');
  }

  /**
   * Moderate user input (pre-moderation)
   */
  async moderateUserInput(request: ModerationRequest): Promise<ModerationResult> {
    if (!this.config.enabled) {
      return { status: 'OK' };
    }

    try {
      // 1. Check message length
      if (request.content.length > this.config.maxMessageLength) {
        await this.logModerationEvent(request, 'BLOCKED', 'Message too long');
        return {
          status: 'BLOCKED',
          reason: `Message exceeds maximum length of ${this.config.maxMessageLength} characters`,
        };
      }

      // 2. Check rate limiting
      const rateLimitResult = this.checkRateLimit(request.userId);
      if (rateLimitResult.status === 'BLOCKED') {
        await this.logModerationEvent(request, 'BLOCKED', 'Rate limit exceeded');
        return rateLimitResult;
      }

      // 3. Check for banned words
      const bannedCheck = containsBannedWords(request.content);
      if (bannedCheck.hasBanned) {
        await this.logModerationEvent(
          request,
          'BLOCKED',
          `Banned words: ${bannedCheck.found.join(', ')}`
        );
        return {
          status: 'BLOCKED',
          reason: 'Message contains inappropriate content',
          blockedWords: bannedCheck.found,
        };
      }

      // 4. Log successful moderation
      await this.logModerationEvent(request, 'OK', undefined);

      return { status: 'OK' };
    } catch (error) {
      logger.error({ error, request }, 'Moderation error');
      // On error, allow message through (fail open) but log it
      return { status: 'OK' };
    }
  }

  /**
   * Moderate AI response (post-moderation)
   */
  async moderateAIResponse(request: ModerationRequest): Promise<ModerationResult> {
    if (!this.config.enabled) {
      return { status: 'OK' };
    }

    try {
      // Check for banned words in AI response
      const bannedCheck = containsBannedWords(request.content);
      if (bannedCheck.hasBanned) {
        await this.logModerationEvent(
          request,
          'BLOCKED',
          `AI response contains banned words: ${bannedCheck.found.join(', ')}`
        );
        return {
          status: 'BLOCKED',
          reason: 'AI response blocked by moderation',
          blockedWords: bannedCheck.found,
        };
      }

      await this.logModerationEvent(request, 'OK', undefined);
      return { status: 'OK' };
    } catch (error) {
      logger.error({ error, request }, 'Post-moderation error');
      return { status: 'OK' };
    }
  }

  /**
   * Check rate limiting for user
   */
  private checkRateLimit(userId: string): ModerationResult {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Get user's message timestamps
    let timestamps = this.userMessageCounts.get(userId) || [];

    // Remove timestamps older than 1 minute
    timestamps = timestamps.filter((ts) => ts > oneMinuteAgo);

    // Check if user exceeded rate limit
    if (timestamps.length >= this.config.maxMessagesPerMinute) {
      logger.warn(
        { userId, messageCount: timestamps.length },
        'User exceeded rate limit'
      );
      return {
        status: 'BLOCKED',
        reason: `Too many messages. Please wait before sending more (max ${this.config.maxMessagesPerMinute} per minute)`,
      };
    }

    // Add current timestamp
    timestamps.push(now);
    this.userMessageCounts.set(userId, timestamps);

    // Clean up old entries (older than 2 minutes)
    const twoMinutesAgo = now - 2 * 60 * 1000;
    for (const [uid, ts] of this.userMessageCounts.entries()) {
      const filtered = ts.filter((t) => t > twoMinutesAgo);
      if (filtered.length === 0) {
        this.userMessageCounts.delete(uid);
      } else {
        this.userMessageCounts.set(uid, filtered);
      }
    }

    return { status: 'OK' };
  }

  /**
   * Log moderation event to database
   */
  private async logModerationEvent(
    request: ModerationRequest,
    status: ModerationStatus,
    reason?: string
  ): Promise<void> {
    try {
      await prisma.providerLog.create({
        data: {
          kind: 'MODERATION',
          userId: request.userId,
          dialogId: request.dialogId,
          request: {
            content: request.content.substring(0, 500), // Truncate for storage
            kind: request.kind,
          } as any,
          response: {
            status,
            reason,
          } as any,
          status: status === 'OK' ? 'SUCCESS' : 'FAILED',
          latencyMs: 0,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to log moderation event');
    }
  }

  /**
   * Get moderation statistics for user
   */
  async getUserModerationStats(userId: string): Promise<{
    totalChecks: number;
    blocked: number;
    passed: number;
  }> {
    const logs = await prisma.providerLog.findMany({
      where: {
        kind: 'MODERATION',
        userId,
      },
      select: {
        status: true,
      },
    });

    const blocked = logs.filter((log) => log.status === 'FAILED').length;
    const passed = logs.filter((log) => log.status === 'SUCCESS').length;

    return {
      totalChecks: logs.length,
      blocked,
      passed,
    };
  }
}

// Export singleton instance
export const moderationService = new ModerationService();
