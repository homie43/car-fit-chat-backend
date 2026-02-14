import { Router } from 'express';
import { DialogsController } from './dialogs.controller';
import { authMiddleware } from '@/shared/middleware/auth.middleware';

const router = Router();
const dialogsController = new DialogsController();

/**
 * @route   GET /dialogs/me
 * @desc    Get current user's dialog (creates if doesn't exist)
 * @access  Private
 */
router.get('/me', authMiddleware, dialogsController.getMyDialog.bind(dialogsController));

/**
 * @route   GET /dialogs/me/messages
 * @desc    Get all messages in current user's dialog
 * @access  Private
 */
router.get(
  '/me/messages',
  authMiddleware,
  dialogsController.getMyMessages.bind(dialogsController)
);

export default router;
