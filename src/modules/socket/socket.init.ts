import { Server as SocketIOServer } from 'socket.io';
import { socketAuthMiddleware } from '@/shared/middleware/socket-auth.middleware';
import { registerSocketHandlers } from './socket.handlers';
import { logger } from '@/shared/utils/logger';

/**
 * Initialize Socket.io server with middleware and handlers
 */
export const initializeSocketIO = (io: SocketIOServer): void => {
  logger.info('Initializing Socket.io server');

  // Apply authentication middleware
  io.use(socketAuthMiddleware);

  // Handle new connections
  io.on('connection', (socket) => {
    logger.info(
      { socketId: socket.id, userId: socket.data.userId },
      'Client connected'
    );

    // Register event handlers
    registerSocketHandlers(socket);
  });

  logger.info('Socket.io server initialized');
};
