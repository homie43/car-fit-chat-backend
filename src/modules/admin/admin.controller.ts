import { Request, Response } from 'express';
import { z } from 'zod';
import { adminService } from './admin.service';
import { logger } from '@/shared/utils/logger';

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(100),
});

const logsQuerySchema = z.object({
  kind: z.enum(['LLM', 'AUTO_DEV', 'MODERATION']).optional(),
  userId: z.string().uuid().optional(),
  dialogId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export class AdminController {
  /**
   * GET /admin/users
   * Get all users with pagination
   */
  async getUsers(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit } = paginationSchema.parse(req.query);

      const result = await adminService.getUsers(page, limit);

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.errors[0].message,
        });
        return;
      }

      logger.error({ error }, 'Failed to get users');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get users',
      });
    }
  }

  /**
   * POST /admin/users/:id/reset-password
   * Reset user password
   */
  async resetUserPassword(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { newPassword } = resetPasswordSchema.parse(req.body);

      const success = await adminService.resetUserPassword(id, newPassword);

      if (!success) {
        res.status(404).json({
          error: 'USER_NOT_FOUND',
          message: 'User not found or password reset failed',
        });
        return;
      }

      res.status(200).json({
        message: 'Password reset successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.errors[0].message,
        });
        return;
      }

      logger.error({ error }, 'Failed to reset password');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to reset password',
      });
    }
  }

  /**
   * GET /admin/dialogs
   * Get all dialogs with pagination
   */
  async getDialogs(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit } = paginationSchema.parse(req.query);

      const result = await adminService.getDialogs(page, limit);

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.errors[0].message,
        });
        return;
      }

      logger.error({ error }, 'Failed to get dialogs');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get dialogs',
      });
    }
  }

  /**
   * GET /admin/dialogs/:id/messages
   * Get dialog messages
   */
  async getDialogMessages(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const dialog = await adminService.getDialogMessages(id);

      if (!dialog) {
        res.status(404).json({
          error: 'DIALOG_NOT_FOUND',
          message: 'Dialog not found',
        });
        return;
      }

      res.status(200).json(dialog);
    } catch (error) {
      logger.error({ error }, 'Failed to get dialog messages');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get dialog messages',
      });
    }
  }

  /**
   * DELETE /admin/dialogs/:id
   * Delete dialog
   */
  async deleteDialog(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const success = await adminService.deleteDialog(id);

      if (!success) {
        res.status(404).json({
          error: 'DIALOG_NOT_FOUND',
          message: 'Dialog not found or deletion failed',
        });
        return;
      }

      res.status(200).json({
        message: 'Dialog deleted successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete dialog');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete dialog',
      });
    }
  }

  /**
   * GET /admin/dialogs/:id/export
   * Export dialog (JSON or CSV)
   */
  async exportDialog(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const format = (req.query.format as string) || 'json';

      if (format === 'csv') {
        const csv = await adminService.exportDialogCSV(id);

        if (!csv) {
          res.status(404).json({
            error: 'DIALOG_NOT_FOUND',
            message: 'Dialog not found',
          });
          return;
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="dialog-${id}.csv"`);
        res.status(200).send(csv);
      } else {
        const json = await adminService.exportDialogJSON(id);

        if (!json) {
          res.status(404).json({
            error: 'DIALOG_NOT_FOUND',
            message: 'Dialog not found',
          });
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="dialog-${id}.json"`);
        res.status(200).json(json);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to export dialog');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to export dialog',
      });
    }
  }

  /**
   * GET /admin/logs
   * Get provider logs with filtering
   */
  async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const { kind, userId, dialogId, page, limit } = logsQuerySchema.parse(req.query);

      const result = await adminService.getLogs(kind, userId, dialogId, page, limit);

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.errors[0].message,
        });
        return;
      }

      logger.error({ error }, 'Failed to get logs');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get logs',
      });
    }
  }

  /**
   * GET /admin/logs/:id
   * Get detailed log by ID
   */
  async getLogDetails(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const log = await adminService.getLogDetails(id);

      if (!log) {
        res.status(404).json({
          error: 'LOG_NOT_FOUND',
          message: 'Log not found',
        });
        return;
      }

      res.status(200).json(log);
    } catch (error) {
      logger.error({ error }, 'Failed to get log details');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get log details',
      });
    }
  }
}

export const adminController = new AdminController();
