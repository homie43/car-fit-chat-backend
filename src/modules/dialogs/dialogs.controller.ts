import { Request, Response, NextFunction } from 'express';
import { DialogsService } from './dialogs.service';

const dialogsService = new DialogsService();

export class DialogsController {
  /**
   * Get current user's dialog
   */
  async getMyDialog(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const dialog = await dialogsService.getOrCreateDialog(req.user.userId);

      res.status(200).json(dialog);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get messages for current user's dialog
   */
  async getMyMessages(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get user's dialog
      const dialog = await dialogsService.getOrCreateDialog(req.user.userId);

      // Get messages
      const messages = await dialogsService.getMessages(dialog.id);

      res.status(200).json(messages);
    } catch (error) {
      next(error);
    }
  }
}
