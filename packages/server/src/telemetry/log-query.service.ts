import type { LogQueryResponse } from '@blackbox/contracts';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma.service';
import { runSerializable } from '../infrastructure/serializable-transaction';
import type { LogQueryDto } from './log-query.dto';
import {
  TELEMETRY_QUERY_DEFAULT_RANGE_MS,
  TELEMETRY_QUERY_MAX_LIMIT,
  TELEMETRY_QUERY_MAX_RANGE_MS,
} from './telemetry.constants';
import { decodeTelemetryCursor, encodeTelemetryCursor } from './telemetry-query.utils';
import { TelemetryRepository } from './telemetry.repository';

@Injectable()
export class LogQueryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TelemetryRepository) private readonly repository: TelemetryRepository,
  ) {}

  async list(
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
    query: LogQueryDto,
  ): Promise<LogQueryResponse> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - TELEMETRY_QUERY_DEFAULT_RANGE_MS);
    const limit = query.limit ?? 50;
    const cursor = query.cursor ? decodeTelemetryCursor(query.cursor, 'log') : undefined;
    if (from >= to || to.getTime() - from.getTime() > TELEMETRY_QUERY_MAX_RANGE_MS) {
      throw new BadRequestException('Log query range must be positive and at most 24 hours');
    }
    return runSerializable(this.prisma, async (transaction) => {
      await this.repository.requireEnvironmentAccess(
        transaction,
        userId,
        teamId,
        projectId,
        environmentId,
      );
      const items = await this.repository.listLogs(
        transaction,
        environmentId,
        from,
        to,
        Math.min(limit + 1, TELEMETRY_QUERY_MAX_LIMIT + 1),
        cursor,
        query.level,
      );
      const hasNextPage = items.length > limit;
      const page = hasNextPage ? items.slice(0, limit) : items;
      const last = page.at(-1);
      return {
        items: page,
        nextCursor:
          hasNextPage && last
            ? encodeTelemetryCursor({ eventId: last.eventId, occurredAt: last.occurredAt })
            : null,
      };
    });
  }
}
