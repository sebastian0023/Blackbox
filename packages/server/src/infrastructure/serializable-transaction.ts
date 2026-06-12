import { Prisma } from '@blackbox/database';
import type { PrismaService } from './prisma.service';

const MAX_SERIALIZATION_ATTEMPTS = 3;

export async function runSerializable<T>(
  prisma: PrismaService,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializationConflict(error) || attempt === MAX_SERIALIZATION_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new Error('Serializable transaction retry limit reached');
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
