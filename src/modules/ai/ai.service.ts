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
  SearchResultForContext,
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

      // === RAG: Extract current preferences and search database BEFORE calling LLM ===
      const currentPreferences = await this.extractCurrentPreferences(
        request.userId,
        request.userMessage
      );

      let searchResults: SearchResultForContext[] = [];
      let ragContext = '';

      // If we have enough preferences, search database
      if (this.hasEnoughPreferencesForSearch(currentPreferences)) {
        logger.info(
          { userId: request.userId, preferences: currentPreferences },
          'Searching database for RAG context'
        );

        searchResults = await carsService.searchCarsForRAG({
          marka: currentPreferences.marka,
          model: currentPreferences.model,
          yearFrom: currentPreferences.yearFrom,
          yearTo: currentPreferences.yearTo,
          power: currentPreferences.power,
          kpp: currentPreferences.kpp,
          bodyType: currentPreferences.bodyType,
          limit: 5, // Limit to top 5 results for context
        });

        if (searchResults.length > 0) {
          ragContext = this.formatSearchResultsForContext(searchResults);
          logger.info(
            { userId: request.userId, resultsCount: searchResults.length },
            'RAG context prepared'
          );
        } else {
          logger.info(
            { userId: request.userId },
            'No cars found in database for current preferences'
          );
        }
      }

      // Build messages array for DeepSeek API
      const messages: DeepSeekMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
      ];

      // === RAG: Add search results as context BEFORE message history ===
      if (ragContext) {
        messages.push({
          role: 'system',
          content: ragContext,
        });
      }

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

  /**
   * Extract preferences from user's saved preferences and current message
   * Combines stored preferences with any new info from current message
   */
  private async extractCurrentPreferences(
    userId: string,
    currentMessage: string
  ): Promise<UserPreferences> {
    // Get user's saved preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const savedPreferences = (user?.preferences as UserPreferences) || {};

    // For MVP: just use saved preferences
    // In future, could use LLM to extract preferences from currentMessage
    return savedPreferences;
  }

  /**
   * Format search results for LLM context
   * Creates a structured text representation of cars from database
   */
  private formatSearchResultsForContext(results: SearchResultForContext[]): string {
    if (results.length === 0) {
      return '';
    }

    let context = 'РЕЗУЛЬТАТЫ ПОИСКА ПО БАЗЕ ДАННЫХ:\n\n';
    context += `Найдено автомобилей: ${results.length}\n\n`;

    results.forEach((car, index) => {
      const years = car.yearFrom && car.yearTo
        ? `${car.yearFrom}-${car.yearTo}`
        : car.yearFrom
        ? `${car.yearFrom}+`
        : 'н/д';

      context += `${index + 1}. ${car.brand} ${car.model}\n`;
      context += `   Вариант: ${car.variant}\n`;
      context += `   Годы выпуска: ${years}\n`;
      context += `   Тип кузова: ${car.bodyType || 'н/д'}\n`;
      context += `   Мощность: ${car.powerText || 'н/д'}\n`;
      context += `   КПП: ${car.kppText || 'н/д'}\n`;
      if (car.description) {
        context += `   Описание: ${car.description}\n`;
      }
      context += '\n';
    });

    context += '---\n';
    context += 'ВАЖНО: Используй ТОЛЬКО эти автомобили для рекомендаций. Не придумывай другие модели.\n';

    return context;
  }

  /**
   * Check if we have enough preferences to search database
   * Need at least 2 key fields filled
   */
  private hasEnoughPreferencesForSearch(preferences: UserPreferences): boolean {
    let filledFields = 0;

    const keyFields = ['marka', 'model', 'kpp', 'yearFrom', 'bodyType'] as const;

    for (const field of keyFields) {
      if (preferences[field]) {
        filledFields++;
      }
    }

    // Need at least 2 fields to search
    return filledFields >= 2;
  }
}

// Export singleton instance
export const aiService = new AIService();
