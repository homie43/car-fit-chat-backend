import { Router } from 'express';
import { adminController } from './admin.controller';
import { authMiddleware } from '@/shared/middleware/auth.middleware';
import { adminMiddleware } from '@/shared/middleware/admin.middleware';

const router = Router();

/**
 * All admin routes require authentication AND admin role
 */
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * Users management
 */
router.get('/users', (req, res) => adminController.getUsers(req, res));
router.post('/users/:id/reset-password', (req, res) =>
  adminController.resetUserPassword(req, res)
);

/**
 * Dialogs management
 */
router.get('/dialogs', (req, res) => adminController.getDialogs(req, res));
router.get('/dialogs/:id/messages', (req, res) =>
  adminController.getDialogMessages(req, res)
);
router.delete('/dialogs/:id', (req, res) => adminController.deleteDialog(req, res));
router.get('/dialogs/:id/export', (req, res) => adminController.exportDialog(req, res));

/**
 * Logs viewing
 */
router.get('/logs', (req, res) => adminController.getLogs(req, res));
router.get('/logs/:id', (req, res) => adminController.getLogDetails(req, res));

export default router;
