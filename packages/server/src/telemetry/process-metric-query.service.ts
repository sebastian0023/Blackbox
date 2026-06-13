import type { ProcessMetricQueryResponse } from '@blackbox/contracts';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../infrastructure/prisma.service';
import { runSerializable } from '../infrastructure/serializable-transaction';
import type { ProcessMetricQueryDto } from './process-metric-query.dto';
import {
  PROCESS_METRIC_QUERY_DEFAULT_RANGE_MS,
  PROCESS_METRIC_QUERY_MAX_LIMIT,
  PROCESS_METRIC_QUERY_MAX_RANGE_MS,
} from './telemetry.constants';
import { TelemetryRepository } from './telemetry.repository';
import type { ProcessMetricCursor } from './telemetry.types';

@Injectable()
export class ProcessMetricQueryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TelemetryRepository) private readonly repository: TelemetryRepository,
  ) {}

  async list(
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
    query: ProcessMetricQueryDto,
  ): Promise<ProcessMetricQueryResponse> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - PROCESS_METRIC_QUERY_DEFAULT_RANGE_MS);
    const limit = query.limit ?? 50;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    if (from >= to || to.getTime() - from.getTime() > PROCESS_METRIC_QUERY_MAX_RANGE_MS) {
      throw new BadRequestException(
        'Process metric query range must be positive and at most 24 hours',
      );
    }

    return runSerializable(this.prisma, async (transaction) => {
      await this.repository.requireEnvironmentAccess(
        transaction,
        userId,
        teamId,
        projectId,
        environmentId,
      );
      const items = await this.repository.listProcessMetrics(
        transaction,
        environmentId,
        from,
        to,
        Math.min(limit + 1, PROCESS_METRIC_QUERY_MAX_LIMIT + 1),
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

function decodeCursor(cursor: string): ProcessMetricCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<ProcessMetricCursor>;
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
    throw new BadRequestException('Invalid process metric query cursor');
  }
}

function encodeCursor(cursor: ProcessMetricCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}
