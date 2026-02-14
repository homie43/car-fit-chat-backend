import { Socket } from 'socket.io';
import {
  ChatUserMessagePayload,
  ChatAssistantStartPayload,
  ChatAssistantDeltaPayload,
  ChatAssistantDonePayload,
  ChatErrorPayload,
  SocketData,
} from './socket.types';
import { logger } from '@/shared/utils/logger';
import { dialogsService } from '@/modules/dialogs/dialogs.service';
import { aiService } from '@/modules/ai/ai.service';
import { moderationService } from '@/modules/moderation/moderation.service';
import { BadRequestError } from '@/shared/utils/errors';

/**
 * Register socket event handlers
 */
export const registerSocketHandlers = (socket: Socket) => {
  const userId = socket.data.userId as string;

  logger.info({ socketId: socket.id, userId }, 'Socket handlers registered');

  // Handle user message
  socket.on('chat:user_message', async (payload: ChatUserMessagePayload) => {
    await handleUserMessage(socket, userId, payload);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id, userId }, 'Socket disconnected');
  });
};

/**
 * Handle user message event
 */
async function handleUserMessage(
  socket: Socket,
  userId: string,
  payload: ChatUserMessagePayload
): Promise<void> {
  const startTime = Date.now();

  try {
    logger.info(
      { userId, textLength: payload.text.length },
      'Processing user message'
    );

    // Validate payload
    if (!payload.text || typeof payload.text !== 'string') {
      throw new BadRequestError('Message text is required');
    }

    if (payload.text.length > 5000) {
      throw new BadRequestError('Message text is too long (max 5000 characters)');
    }

    // Get or create dialog based on userId from JWT token
    // dialogId is determined server-side, client cannot override it
    const dialog = await dialogsService.getOrCreateDialog(userId);

    // Pre-moderation check
    const moderationResult = await moderationService.moderateUserInput({
      userId,
      dialogId: dialog.id,
      content: payload.text,
      kind: 'PRE_MODERATION',
    });

    if (moderationResult.status === 'BLOCKED') {
      logger.warn(
        { userId, dialogId: dialog.id, reason: moderationResult.reason },
        'Message blocked by moderation'
      );

      // Save blocked message to database
      await dialogsService.createMessage(
        dialog.id,
        'USER',
        payload.text,
        'BLOCKED',
        moderationResult.reason
      );

      // Send error to client
      const errorPayload: ChatErrorPayload = {
        code: 'MODERATION_BLOCKED',
        message: moderationResult.reason || 'Message blocked by moderation',
      };
      socket.emit('chat:error', errorPayload);
      return;
    }

    // Save user message to database
    const userMessage = await dialogsService.createMessage(
      dialog.id,
      'USER',
      payload.text,
      'OK'
    );

    logger.info(
      { messageId: userMessage.id, userId, dialogId: dialog.id },
      'User message saved'
    );

    // Get message history
    const messageHistory = await dialogsService.getMessages(dialog.id, 20);

    // Process message with AI and stream response
    await processAIResponse(socket, {
      userId,
      dialogId: dialog.id,
      userMessage: payload.text,
      messageHistory: messageHistory.map(({role, content}) => ({
        role: role,
        content: content,
      })),
    });

    const duration = Date.now() - startTime;
    logger.info({ userId, messageId: userMessage.id, duration }, 'Message processed');
  } catch (error) {
    logger.error({ error, userId, payload }, 'Error handling user message');

    const errorPayload: ChatErrorPayload = {
      code: error instanceof BadRequestError ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An error occurred',
    };

    socket.emit('chat:error', errorPayload);
  }
}

/**
 * Process AI response and stream to client
 */
async function processAIResponse(
  socket: Socket,
  request: {
    userId: string;
    dialogId: string;
    userMessage: string;
    messageHistory: Array<{ role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string }>;
  }
): Promise<void> {
  // Generate message ID
  const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  // Emit start event
  const startPayload: ChatAssistantStartPayload = {
    messageId: assistantMessageId,
  };
  socket.emit('chat:assistant_start', startPayload);

  try {
    // Stream AI response
    const streamGenerator = aiService.processMessageStream(request);

    let finalResult;

    // Process all chunks from the generator
    while (true) {
      const { value, done } = await streamGenerator.next();

      if (done) {
        // Generator finished, value contains the final ProcessMessageResponse
        finalResult = value;
        break;
      }

      // value is a string chunk, emit it to client
      const deltaPayload: ChatAssistantDeltaPayload = {
        messageId: assistantMessageId,
        deltaText: value,
      };
      socket.emit('chat:assistant_delta', deltaPayload);
    }

    if (!finalResult) {
      throw new Error('No result from AI service');
    }

    // Remove [PREFERENCES] block from message before moderation
    const cleanMessage = finalResult.assistantMessage.replace(
      /\[PREFERENCES\][\s\S]*?\[\/PREFERENCES\]/,
      ''
    ).trim();

    // Post-moderation check for AI response
    const postModerationResult = await moderationService.moderateAIResponse({
      userId: request.userId,
      dialogId: request.dialogId,
      content: cleanMessage,
      kind: 'POST_MODERATION',
    });

    if (postModerationResult.status === 'BLOCKED') {
      logger.warn(
        { userId: request.userId, dialogId: request.dialogId, reason: postModerationResult.reason },
        'AI response blocked by moderation'
      );

      // Save blocked message to database
      await dialogsService.createMessage(
        request.dialogId,
        'ASSISTANT',
        cleanMessage,
        'BLOCKED',
        postModerationResult.reason
      );

      // Send fallback message to client
      const fallbackMessage = 'Извините, не могу ответить на это сообщение. Попробуйте переформулировать вопрос.';

      const donePayload: ChatAssistantDonePayload = {
        messageId: assistantMessageId,
        finalText: fallbackMessage,
        extractedPreferencesJson: finalResult.extractedPreferences,
      };
      socket.emit('chat:assistant_done', donePayload);

      // Save fallback message
      await dialogsService.createMessage(
        request.dialogId,
        'ASSISTANT',
        fallbackMessage,
        'OK'
      );

      return;
    }

    // Emit done event with clean text (no [PREFERENCES] block)
    const donePayload: ChatAssistantDonePayload = {
      messageId: assistantMessageId,
      finalText: cleanMessage,
      extractedPreferencesJson: finalResult.extractedPreferences,
    };
    socket.emit('chat:assistant_done', donePayload);

    // Save assistant message to database
    await dialogsService.createMessage(
      request.dialogId,
      'ASSISTANT',
      cleanMessage,
      'OK'
    );

    logger.info(
      {
        userId: request.userId,
        dialogId: request.dialogId,
        messageId: assistantMessageId,
        preferences: finalResult.extractedPreferences,
      },
      'AI response processed successfully'
    );
  } catch (error) {
    logger.error({ error, userId: request.userId }, 'AI processing error');

    const errorPayload: ChatErrorPayload = {
      code: 'AI_ERROR',
      message: error instanceof Error ? error.message : 'Failed to process AI response',
    };
    socket.emit('chat:error', errorPayload);
  }
}
