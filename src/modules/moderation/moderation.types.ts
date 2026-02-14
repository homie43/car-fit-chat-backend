/**
 * Moderation module types
 */

export type ModerationStatus = 'OK' | 'BLOCKED';

export type ModerationKind = 'PRE_MODERATION' | 'POST_MODERATION';

export interface ModerationResult {
  status: ModerationStatus;
  reason?: string;
  blockedWords?: string[];
}

export interface ModerationRequest {
  userId: string;
  dialogId?: string;
  content: string;
  kind: ModerationKind;
}

export interface ModerationConfig {
  enabled: boolean;
  bannedWords: string[];
  maxMessageLength: number;
  maxMessagesPerMinute: number;
  blockOnMatch: boolean; // If true, block immediately on keyword match
}
