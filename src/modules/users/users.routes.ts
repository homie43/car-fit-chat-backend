import { Router } from 'express';
import { UsersController } from './users.controller';
import { authMiddleware } from '@/shared/middleware/auth.middleware';

const router = Router();
const usersController = new UsersController();

/**
 * @route   GET /me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authMiddleware, usersController.getMe.bind(usersController));

export default router;
