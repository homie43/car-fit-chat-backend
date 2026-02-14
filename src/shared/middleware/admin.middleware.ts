import { Request, Response, NextFunction } from 'express';
import { logger } from '@/shared/utils/logger';
import { UnauthorizedError } from '@/shared/utils/errors';

/**
 * Admin role middleware
 * Requires user to have ADMIN role
 * Must be used after authMiddleware
 */
export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const user = (req as any).user;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (user.role !== 'ADMIN') {
      logger.warn(
        { userId: user.userId, role: user.role },
        'Unauthorized admin access attempt'
      );
      throw new UnauthorizedError('Admin access required');
    }

    logger.debug({ userId: user.userId }, 'Admin access granted');
    next();
  } catch (error) {
    next(error);
  }
};
