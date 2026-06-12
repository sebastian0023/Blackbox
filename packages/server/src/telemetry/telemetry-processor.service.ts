import type { HeartbeatBatch } from '@blackbox/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { PrismaService } from '../infrastructure/prisma.service';
import { runSerializable } from '../infrastructure/serializable-transaction';
import { HeartbeatBatchDto } from './telemetry.dto';
import { TelemetryRepository } from './telemetry.repository';
import type { HeartbeatJob } from './telemetry.types';

@Injectable()
export class TelemetryProcessorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TelemetryRepository) private readonly repository: TelemetryRepository,
  ) {}

  process(job: HeartbeatJob): Promise<boolean> {
    assertHeartbeatJob(job);
    return runSerializable(this.prisma, (transaction) =>
      this.repository.persistHeartbeatBatch(transaction, job),
    );
  }
}

function assertHeartbeatJob(job: HeartbeatJob): asserts job is HeartbeatJob {
  const batch = job?.batch as Partial<HeartbeatBatch> | undefined;
  const batchValidation = batch
    ? validateSync(plainToInstance(HeartbeatBatchDto, batch), {
        forbidNonWhitelisted: true,
        whitelist: true,
      })
    : [];
  if (
    !batch ||
    batchValidation.length > 0 ||
    !isUUID(job.environmentId, '4') ||
    !isUUID(job.ingestKeyId, '4') ||
    Object.keys(job).some((key) => !['batch', 'environmentId', 'ingestKeyId'].includes(key))
  ) {
    throw new Error('Invalid heartbeat job');
  }
}
