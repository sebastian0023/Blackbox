import type { TelemetryBatch } from '@blackbox/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { PrismaService } from '../infrastructure/prisma.service';
import { runSerializable } from '../infrastructure/serializable-transaction';
import { TelemetryBatchDto } from './telemetry.dto';
import { TelemetryRepository } from './telemetry.repository';
import type { TelemetryJob } from './telemetry.types';
import { hasValidTelemetryEventSizes } from './telemetry-validation';

@Injectable()
export class TelemetryProcessorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TelemetryRepository) private readonly repository: TelemetryRepository,
  ) {}

  process(job: TelemetryJob): Promise<boolean> {
    assertTelemetryJob(job);
    return runSerializable(this.prisma, (transaction) =>
      this.repository.persistTelemetryBatch(transaction, job),
    );
  }
}

function assertTelemetryJob(job: TelemetryJob): asserts job is TelemetryJob {
  const batch = job?.batch as Partial<TelemetryBatch> | undefined;
  const batchValidation = batch
    ? validateSync(plainToInstance(TelemetryBatchDto, batch), {
        forbidNonWhitelisted: true,
        whitelist: true,
      })
    : [];
  if (
    !batch ||
    batchValidation.length > 0 ||
    !hasValidTelemetryEventSizes(batch as TelemetryBatch) ||
    !isUUID(job.environmentId, '4') ||
    !isUUID(job.ingestKeyId, '4') ||
    Object.keys(job).some((key) => !['batch', 'environmentId', 'ingestKeyId'].includes(key))
  ) {
    throw new Error('Invalid telemetry job');
  }
}
