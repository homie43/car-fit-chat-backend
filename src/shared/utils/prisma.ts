import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Singleton Prisma Client instance
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

// Log queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e: any) => {
    logger.debug({ query: e.query, params: e.params, duration: e.duration }, 'Prisma Query');
  });
}

prisma.$on('error', (e: any) => {
  logger.error({ error: e }, 'Prisma Error');
});

prisma.$on('warn', (e: any) => {
  logger.warn({ warning: e }, 'Prisma Warning');
});

export { prisma };
