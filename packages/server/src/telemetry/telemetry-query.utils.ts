import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { HeartbeatCursor } from './telemetry.types';

export function decodeTelemetryCursor(cursor: string, label: string): HeartbeatCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<HeartbeatCursor>;
    if (
      typeof parsed.eventId !== 'string' ||
      !isUUID(parsed.eventId, '4') ||
      typeof parsed.occurredAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.occurredAt))
    ) {
      throw new Error('Invalid cursor');
    }
    return { eventId: parsed.eventId, occurredAt: parsed.occurredAt };
  } catch {
    throw new BadRequestException(`Invalid ${label} query cursor`);
  }
}

export function encodeTelemetryCursor(cursor: HeartbeatCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}
