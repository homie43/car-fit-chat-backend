import { fetch } from 'undici';
import { logger } from '@/shared/utils/logger';
import { prisma } from '@/shared/utils/prisma';
import { carsService } from '@/modules/cars/cars.service';
import {
  ProcessMessageRequest,
  ProcessMessageResponse,
  UserPreferences,
  DeepSeekMessage,
  DeepSeekChatRequest,
  DeepSeekStreamChunk,
} from './ai.types';
import { getSystemPrompt } from './ai.prompts';

export class AIService {
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
    this.apiKey = process.env.DEEPSEEK_API_KEY || '';
    this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!this.apiKey) {
      logger.warn('DEEPSEEK_API_KEY not configured');
    }
  }

  /**
   * Process user message with streaming support
   * @returns AsyncGenerator that yields text chunks
   */
  async *processMessageStream(
    request: ProcessMessageRequest
  ): AsyncGenerator<string, ProcessMessageResponse, undefined> {
    const startTime = Date.now();

    try {
      // Get user info for language preference
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { language: true, preferences: true },
      });

      const language = user?.language || 'RU';
      const systemPrompt = getSystemPrompt(language);

      // Build messages array for DeepSeek API
      const messages: DeepSeekMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
      ];

      // Add message history (limit to last 20 messages to avoid token limit)
      const recentHistory = request.messageHistory.slice(-20);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
          content: msg.content,
        });
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: request.userMessage,
      });

      // Make streaming request to DeepSeek API
      const response = await fetch(`${this.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.7,
          max_tokens: 2000,
          stream: true,
        } as DeepSeekChatRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          { status: response.status, error: errorText },
          'DeepSeek API error'
        );
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      // Process streaming response
      let fullResponse = '';
      let streamBuffer = ''; // Buffer for filtering [PREFERENCES] block
      let insidePreferencesBlock = false;
      const body = response.body;

      if (!body) {
        throw new Error('No response body from DeepSeek API');
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.trim() === 'data: [DONE]') continue;

          if (line.startsWith('data: ')) {
            try {
              const jsonData = line.slice(6);
              const chunk: DeepSeekStreamChunk = JSON.parse(jsonData);

              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                streamBuffer += content;

                // Check if we're entering or inside PREFERENCES block
                if (streamBuffer.includes('[PREFERENCES]')) {
                  insidePreferencesBlock = true;
                }

                // If we're inside PREFERENCES block, check if it's closed
                if (insidePreferencesBlock && streamBuffer.includes('[/PREFERENCES]')) {
                  // Remove the entire PREFERENCES block from buffer
                  const beforeBlock = streamBuffer.split('[PREFERENCES]')[0];
                  const afterBlock = streamBuffer.split('[/PREFERENCES]')[1] || '';

                  // Stream the content before and after the block
                  if (beforeBlock) {
                    yield beforeBlock;
                  }
                  if (afterBlock) {
                    yield afterBlock;
                  }

                  streamBuffer = '';
                  insidePreferencesBlock = false;
                } else if (!insidePreferencesBlock) {
                  // Only stream if we're not inside PREFERENCES block
                  // Keep last 20 chars in buffer to handle block start across chunks
                  const safeLength = Math.max(0, streamBuffer.length - 20);
                  if (safeLength > 0) {
                    const safeContent = streamBuffer.substring(0, safeLength);
                    yield safeContent;
                    streamBuffer = streamBuffer.substring(safeLength);
                  }
                }
              }
            } catch (parseError) {
              logger.warn({ line, parseError }, 'Failed to parse SSE chunk');
            }
          }
        }
      }

      // Flush remaining buffer (except PREFERENCES block)
      if (streamBuffer && !insidePreferencesBlock) {
        // Remove any remaining PREFERENCES block
        const cleaned = streamBuffer.replace(/\[PREFERENCES\][\s\S]*?\[\/PREFERENCES\]/g, '');
        if (cleaned) {
          yield cleaned;
        }
      }

      // Extract preferences from response
      const extractedPreferences = this.extractPreferences(fullResponse);

      // Update user preferences in database
      if (Object.keys(extractedPreferences).length > 0) {
        await prisma.user.update({
          where: { id: request.userId },
          data: {
            preferences: extractedPreferences as any,
          },
        });

        logger.info(
          { userId: request.userId, preferences: extractedPreferences },
          'User preferences updated'
        );
      }

      // Search for cars if enough preferences are available
      let searchResults: any[] | undefined;
      if (this.hasEnoughPreferences(extractedPreferences)) {
        searchResults = await this.searchCars(extractedPreferences);
        logger.info(
          { userId: request.userId, resultsCount: searchResults.length },
          'Car search performed'
        );
      }

      // Log provider request/response
      const duration = Date.now() - startTime;
      await this.logProviderRequest(
        request.userId,
        request.dialogId,
        messages,
        fullResponse,
        duration
      );

      return {
        assistantMessage: fullResponse,
        extractedPreferences,
        searchResults,
      };
    } catch (error) {
      logger.error({ error, userId: request.userId }, 'AI processing error');
      throw error;
    }
  }

  /**
   * Extract preferences from assistant response
   */
  private extractPreferences(responseText: string): UserPreferences {
    try {
      // Look for [PREFERENCES]...[/PREFERENCES] block
      const match = responseText.match(
        /\[PREFERENCES\]([\s\S]*?)\[\/PREFERENCES\]/
      );

      if (!match) {
        return {};
      }

      const jsonText = match[1].trim();
      const preferences = JSON.parse(jsonText);

      // Clean and validate preferences
      const cleaned: UserPreferences = {};

      if (preferences.marka && typeof preferences.marka === 'string') {
        cleaned.marka = preferences.marka;
      }
      if (preferences.model && typeof preferences.model === 'string') {
        cleaned.model = preferences.model;
      }
      if (preferences.country && typeof preferences.country === 'string') {
        cleaned.country = preferences.country;
      }
      if (preferences.color && typeof preferences.color === 'string') {
        cleaned.color = preferences.color;
      }
      if (preferences.power && typeof preferences.power === 'string') {
        cleaned.power = preferences.power;
      }
      if (preferences.kpp && typeof preferences.kpp === 'string') {
        cleaned.kpp = preferences.kpp;
      }
      if (preferences.yearFrom && typeof preferences.yearFrom === 'number') {
        cleaned.yearFrom = preferences.yearFrom;
      }
      if (preferences.yearTo && typeof preferences.yearTo === 'number') {
        cleaned.yearTo = preferences.yearTo;
      }
      if (preferences.bodyType && typeof preferences.bodyType === 'string') {
        cleaned.bodyType = preferences.bodyType;
      }
      if (preferences.budget && typeof preferences.budget === 'number') {
        cleaned.budget = preferences.budget;
      }

      return cleaned;
    } catch (error) {
      logger.warn({ error, responseText }, 'Failed to extract preferences');
      return {};
    }
  }

  /**
   * Check if user has enough preferences to search for cars
   */
  private hasEnoughPreferences(preferences: UserPreferences): boolean {
    let filledFields = 0;

    const keyFields = ['marka', 'model', 'kpp', 'yearFrom'] as const;

    for (const field of keyFields) {
      if (preferences[field]) {
        filledFields++;
      }
    }

    return filledFields >= 3;
  }

  /**
   * Search for cars based on preferences
   */
  private async searchCars(
    preferences: UserPreferences
  ): Promise<any[]> {
    try {
      const searchResults = await carsService.searchCars({
        marka: preferences.marka,
        model: preferences.model,
        yearFrom: preferences.yearFrom,
        yearTo: preferences.yearTo,
        power: preferences.power,
        kpp: preferences.kpp,
        bodyType: preferences.bodyType,
      });

      return searchResults;
    } catch (error) {
      logger.error({ error, preferences }, 'Car search error');
      return [];
    }
  }

  /**
   * Log provider request/response to database
   */
  private async logProviderRequest(
    userId: string,
    dialogId: string,
    messages: DeepSeekMessage[],
    response: string,
    latencyMs: number
  ): Promise<void> {
    try {
      await prisma.providerLog.create({
        data: {
          kind: 'LLM',
          userId,
          dialogId,
          request: messages as any,
          response: { content: response } as any,
          status: 'SUCCESS',
          latencyMs,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to log provider request');
    }
  }

  /**
   * Validate VIN format (17 characters)
   */
  validateVIN(vin: string): boolean {
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
    return vinRegex.test(vin);
  }
}

// Export singleton instance
export const aiService = new AIService();
