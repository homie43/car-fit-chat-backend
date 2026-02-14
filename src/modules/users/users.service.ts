import { prisma } from '@/shared/utils/prisma';
import { NotFoundError } from '@/shared/utils/errors';

export class UsersService {
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        language: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  async updatePreferences(userId: string, preferences: any) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        preferences,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        language: true,
        preferences: true,
      },
    });

    return user;
  }
}
