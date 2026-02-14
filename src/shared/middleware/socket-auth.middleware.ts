import { Socket } from 'socket.io';
import { verifyToken } from '@/shared/utils/jwt';
import { logger } from '@/shared/utils/logger';

/**
 * Socket.io authentication middleware
 * Verifies JWT token from handshake auth or query
 */
export const socketAuthMiddleware = async (
  socket: Socket,
  next: (err?: Error) => void
) => {
  try {
    // Get token from handshake auth or query
    const token =
      socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      logger.warn(
        { socketId: socket.id },
        'Socket connection attempt without token'
      );
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      logger.error('JWT_ACCESS_SECRET not configured');
      return next(new Error('Server configuration error'));
    }

    const payload = verifyToken(token, secret);

    if (!payload || !payload.userId) {
      logger.warn({ socketId: socket.id }, 'Invalid token payload');
      return next(new Error('Invalid authentication token'));
    }

    // Attach user info to socket
    socket.data.userId = payload.userId;
    socket.data.userRole = payload.role;

    logger.info(
      { socketId: socket.id, userId: payload.userId },
      'Socket authenticated successfully'
    );

    next();
  } catch (error) {
    logger.error({ error, socketId: socket.id }, 'Socket authentication error');
    next(new Error('Authentication failed'));
  }
};
