/**
 * AI module types
 */

// ============================================
// USER PREFERENCES
// ============================================

export interface UserPreferences {
  marka?: string; // Brand
  model?: string; // Model
  country?: string; // Country of origin
  color?: string; // Color
  power?: string; // Engine power (HP)
  kpp?: string; // Transmission type (AT/MT/CVT/Robot)
  yearFrom?: number; // Year from
  yearTo?: number; // Year to
  bodyType?: string; // Body type (sedan/hatchback/etc)
  budget?: number; // Budget
}

// ============================================
// AI SERVICE REQUEST/RESPONSE
// ============================================

export interface ProcessMessageRequest {
  userId: string;
  dialogId: string;
  userMessage: string;
  messageHistory: MessageHistoryItem[];
}

export interface MessageHistoryItem {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
}

export interface ProcessMessageResponse {
  assistantMessage: string;
  extractedPreferences: UserPreferences;
  searchResults?: any[]; // Car search results if preferences are complete
}

// ============================================
// DEEPSEEK API TYPES
// ============================================

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekChatRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface DeepSeekChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface DeepSeekStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}
