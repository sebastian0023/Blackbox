import type { HeartbeatBatch, IngestBatchResponse } from '@blackbox/contracts';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../infrastructure/prisma.service';
import { TelemetryQueueService } from './telemetry-queue.service';

@Injectable()
export class TelemetryIngestionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TelemetryQueueService) private readonly queue: TelemetryQueueService,
  ) {}

  async ingest(ingestKey: string, batch: HeartbeatBatch): Promise<IngestBatchResponse> {
    this.requireCurrentTimestamps(batch);
    const key = await this.prisma.ingestKey.findUnique({
      select: { environmentId: true, id: true, revokedAt: true },
      where: { secretHash: createHash('sha256').update(ingestKey, 'utf8').digest('hex') },
    });
    if (!key || key.revokedAt) {
      throw new UnauthorizedException('Invalid ingest key');
    }

    await this.queue.enqueue({ batch, environmentId: key.environmentId, ingestKeyId: key.id });
    return { batchId: batch.batchId, status: 'queued' };
  }

  private requireCurrentTimestamps(batch: HeartbeatBatch): void {
    const now = Date.now();
    const earliest = now - 24 * 60 * 60 * 1_000;
    const latest = now + 5 * 60 * 1_000;
    const timestamps = [batch.sentAt, ...batch.events.map(({ occurredAt }) => occurredAt)];

    if (
      timestamps.some(
        (timestamp) => Date.parse(timestamp) < earliest || Date.parse(timestamp) > latest,
      )
    ) {
      throw new BadRequestException(
        'Heartbeat timestamps must be within the accepted ingestion window',
      );
    }
  }
}
