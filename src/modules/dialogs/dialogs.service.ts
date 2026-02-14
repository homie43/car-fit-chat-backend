import { prisma } from '@/shared/utils/prisma';
import { logger } from '@/shared/utils/logger';

export class DialogsService {
  /**
   * Get or create dialog for user
   * One dialog per user
   */
  async getOrCreateDialog(userId: string) {
    // Try to find existing dialog
    let dialog = await prisma.dialog.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Create if doesn't exist
    if (!dialog) {
      dialog = await prisma.dialog.create({
        data: {
          userId,
        },
        select: {
          id: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logger.info({ userId, dialogId: dialog.id }, 'Dialog created');
    }

    return dialog;
  }

  /**
   * Get dialog messages
   */
  async getMessages(dialogId: string, limit = 100, offset = 0) {
    const messages = await prisma.message.findMany({
      where: { dialogId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        dialogId: true,
        role: true,
        content: true,
        moderationStatus: true,
        blockedReason: true,
        createdAt: true,
      },
    });

    return messages;
  }

  /**
   * Create message
   */
  async createMessage(
    dialogId: string,
    role: 'USER' | 'ASSISTANT' | 'SYSTEM',
    content: string,
    moderationStatus: 'OK' | 'BLOCKED' = 'OK',
    blockedReason?: string
  ) {
    const message = await prisma.message.create({
      data: {
        dialogId,
        role,
        content,
        moderationStatus,
        blockedReason,
      },
      select: {
        id: true,
        dialogId: true,
        role: true,
        content: true,
        moderationStatus: true,
        blockedReason: true,
        createdAt: true,
      },
    });

    // Update dialog updatedAt timestamp
    await prisma.dialog.update({
      where: { id: dialogId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  /**
   * Delete dialog and all messages
   */
  async deleteDialog(dialogId: string) {
    await prisma.dialog.delete({
      where: { id: dialogId },
    });

    logger.info({ dialogId }, 'Dialog deleted');
  }
}

// Export singleton instance
export const dialogsService = new DialogsService();
