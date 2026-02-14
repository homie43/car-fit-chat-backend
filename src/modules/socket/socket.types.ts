/**
 * Socket.io event types and payloads
 */

// ============================================
// CLIENT -> SERVER EVENTS
// ============================================

export interface ChatUserMessagePayload {
  text: string;
}

// ============================================
// SERVER -> CLIENT EVENTS
// ============================================

export interface ChatAssistantStartPayload {
  messageId: string;
}

export interface ChatAssistantDeltaPayload {
  messageId: string;
  deltaText: string;
}

export interface ChatAssistantDonePayload {
  messageId: string;
  finalText: string;
  extractedPreferencesJson?: Record<string, any>;
}

export interface ChatErrorPayload {
  code: string;
  message: string;
}

// ============================================
// SOCKET DATA (attached to socket.data)
// ============================================

export interface SocketData {
  userId: string;
  userRole: 'USER' | 'ADMIN';
}
