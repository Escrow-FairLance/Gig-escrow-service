import { PrismaClient } from '@prisma/client';
import { config } from '../config/env.js';

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: config.DATABASE_URL,
      },
    },
    log: config.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma: PrismaClient =
  global.__prismaClient ?? (global.__prismaClient = createPrismaClient());

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.info('Successfully connected to PostgreSQL via Prisma');
  } catch (error) {
    console.error('Failed to connect to PostgreSQL database:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.info('Prisma disconnected gracefully from PostgreSQL');
  } catch (error) {
    console.error('Error disconnecting Prisma client:', error);
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.warn('Database health check query failed:', error);
    return false;
  }
}
