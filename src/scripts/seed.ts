/**
 * Seed script to create initial admin user
 * Usage: npm run seed
 */
import 'dotenv/config';
import { prisma } from '../shared/utils/prisma';
import { hashPassword } from '../shared/utils/password';
import { logger } from '../shared/utils/logger';

async function main() {
  logger.info('Starting seed...');

  // Create admin user
  const adminEmail = 'admin@carfit.com';
  const adminPassword = 'admin123456'; // Change in production!

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    logger.info('Admin user already exists, skipping');
  } else {
    const adminPasswordHash = await hashPassword(adminPassword);

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        name: 'Admin',
        role: 'ADMIN',
        language: 'RU',
      },
    });

    logger.info(
      {
        id: admin.id,
        email: admin.email,
      },
      'Admin user created'
    );
    logger.info(
      `Admin credentials: ${adminEmail} / ${adminPassword} (change this in production!)`
    );
  }

  logger.info('Seed completed successfully');
}

main()
  .catch((error) => {
    logger.error({ error }, 'Seed failed');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
