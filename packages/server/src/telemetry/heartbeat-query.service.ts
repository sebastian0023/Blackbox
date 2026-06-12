import type { HeartbeatQueryResponse } from '@blackbox/contracts';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../infrastructure/prisma.service';
import { runSerializable } from '../infrastructure/serializable-transaction';
import type { HeartbeatQueryDto } from './heartbeat-query.dto';
import {
  HEARTBEAT_QUERY_DEFAULT_RANGE_MS,
  HEARTBEAT_QUERY_MAX_LIMIT,
  HEARTBEAT_QUERY_MAX_RANGE_MS,
} from './telemetry.constants';
import { TelemetryRepository } from './telemetry.repository';
import type { HeartbeatCursor } from './telemetry.types';

@Injectable()
export class HeartbeatQueryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TelemetryRepository) private readonly repository: TelemetryRepository,
  ) {}

  async list(
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
    query: HeartbeatQueryDto,
  ): Promise<HeartbeatQueryResponse> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - HEARTBEAT_QUERY_DEFAULT_RANGE_MS);
    const limit = query.limit ?? 50;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    if (from >= to || to.getTime() - from.getTime() > HEARTBEAT_QUERY_MAX_RANGE_MS) {
      throw new BadRequestException('Heartbeat query range must be positive and at most 24 hours');
    }

    return runSerializable(this.prisma, async (transaction) => {
      await this.repository.requireEnvironmentAccess(
        transaction,
        userId,
        teamId,
        projectId,
        environmentId,
      );
      const items = await this.repository.listHeartbeats(
        transaction,
        environmentId,
        from,
        to,
        Math.min(limit + 1, HEARTBEAT_QUERY_MAX_LIMIT + 1),
        cursor,
      );
      const hasNextPage = items.length > limit;
      const page = hasNextPage ? items.slice(0, limit) : items;
      const last = page.at(-1);

      return {
        items: page,
        nextCursor:
          hasNextPage && last
            ? encodeCursor({ eventId: last.eventId, occurredAt: last.occurredAt })
            : null,
      };
    });
  }
}

function decodeCursor(cursor: string): HeartbeatCursor {
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
    throw new BadRequestException('Invalid heartbeat query cursor');
  }
}

function encodeCursor(cursor: HeartbeatCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}
