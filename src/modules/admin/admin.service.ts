import { prisma } from '@/shared/utils/prisma';
import { logger } from '@/shared/utils/logger';
import { hashPassword } from '@/shared/utils/password';
import {
  UserListItem,
  DialogListItem,
  LogListItem,
  DialogExportFormat,
  PaginatedResponse,
} from './admin.types';

export class AdminService {
  /**
   * Get all users with pagination
   */
  async getUsers(page = 1, limit = 50): Promise<PaginatedResponse<UserListItem>> {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          language: true,
          createdAt: true,
          dialog: {
            select: {
              id: true,
            },
          },
        },
      }),
      prisma.user.count(),
    ]);

    // Get message counts for each user
    const usersWithCounts = await Promise.all(
      users.map(async (user) => {
        const messageCount = await prisma.message.count({
          where: {
            dialog: {
              userId: user.id,
            },
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          language: user.language || 'RU',
          createdAt: user.createdAt,
          dialogCount: user.dialog ? 1 : 0,
          messageCount,
        };
      })
    );

    return {
      data: usersWithCounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Reset user password
   */
  async resetUserPassword(userId: string, newPassword: string): Promise<boolean> {
    try {
      const hashedPassword = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hashedPassword },
      });

      logger.info({ userId }, 'User password reset by admin');
      return true;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to reset user password');
      return false;
    }
  }

  /**
   * Get all dialogs with pagination
   */
  async getDialogs(page = 1, limit = 50): Promise<PaginatedResponse<DialogListItem>> {
    const skip = (page - 1) * limit;

    const [dialogs, total] = await Promise.all([
      prisma.dialog.findMany({
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
      }),
      prisma.dialog.count(),
    ]);

    // Get last message timestamp for each dialog
    const dialogsWithLastMessage = await Promise.all(
      dialogs.map(async (dialog) => {
        const lastMessage = await prisma.message.findFirst({
          where: { dialogId: dialog.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        return {
          id: dialog.id,
          userId: dialog.userId,
          userEmail: dialog.user.email,
          userName: dialog.user.name,
          messageCount: dialog._count.messages,
          lastMessageAt: lastMessage?.createdAt || null,
          createdAt: dialog.createdAt,
        };
      })
    );

    return {
      data: dialogsWithLastMessage,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get dialog messages
   */
  async getDialogMessages(dialogId: string) {
    const dialog = await prisma.dialog.findUnique({
      where: { id: dialogId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            moderationStatus: true,
            blockedReason: true,
            createdAt: true,
          },
        },
      },
    });

    return dialog;
  }

  /**
   * Delete dialog and all its messages
   */
  async deleteDialog(dialogId: string): Promise<boolean> {
    try {
      await prisma.dialog.delete({
        where: { id: dialogId },
      });

      logger.info({ dialogId }, 'Dialog deleted by admin');
      return true;
    } catch (error) {
      logger.error({ error, dialogId }, 'Failed to delete dialog');
      return false;
    }
  }

  /**
   * Export dialog to JSON
   */
  async exportDialogJSON(dialogId: string): Promise<DialogExportFormat | null> {
    try {
      const dialog = await this.getDialogMessages(dialogId);

      if (!dialog) {
        return null;
      }

      return {
        dialog: {
          id: dialog.id,
          userId: dialog.userId,
          createdAt: dialog.createdAt,
          updatedAt: dialog.updatedAt,
        },
        user: {
          id: dialog.user.id,
          email: dialog.user.email,
          name: dialog.user.name,
        },
        messages: dialog.messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          moderationStatus: msg.moderationStatus,
          createdAt: msg.createdAt,
        })),
        exportedAt: new Date(),
      };
    } catch (error) {
      logger.error({ error, dialogId }, 'Failed to export dialog');
      return null;
    }
  }

  /**
   * Export dialog to CSV
   */
  async exportDialogCSV(dialogId: string): Promise<string | null> {
    try {
      const dialog = await this.getDialogMessages(dialogId);

      if (!dialog) {
        return null;
      }

      // CSV header
      const header = 'ID,Role,Content,Moderation Status,Created At\n';

      // CSV rows
      const rows = dialog.messages
        .map((msg) => {
          const content = msg.content.replace(/"/g, '""'); // Escape quotes
          return `"${msg.id}","${msg.role}","${content}","${msg.moderationStatus}","${msg.createdAt.toISOString()}"`;
        })
        .join('\n');

      return header + rows;
    } catch (error) {
      logger.error({ error, dialogId }, 'Failed to export dialog to CSV');
      return null;
    }
  }

  /**
   * Get provider logs with filtering
   */
  async getLogs(
    kind?: string,
    userId?: string,
    dialogId?: string,
    page = 1,
    limit = 100
  ): Promise<PaginatedResponse<LogListItem>> {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (kind) where.kind = kind;
    if (userId) where.userId = userId;
    if (dialogId) where.dialogId = dialogId;

    const [logs, total] = await Promise.all([
      prisma.providerLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          kind: true,
          userId: true,
          dialogId: true,
          status: true,
          latencyMs: true,
          createdAt: true,
        },
      }),
      prisma.providerLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get detailed log by ID
   */
  async getLogDetails(logId: string) {
    return await prisma.providerLog.findUnique({
      where: { id: logId },
    });
  }
}

// Export singleton instance
export const adminService = new AdminService();
