import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma.service';
import { runSerializable } from '../infrastructure/serializable-transaction';
import { TelemetryRepository } from './telemetry.repository';

@Injectable()
export class MissingHeartbeatEvaluatorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TelemetryRepository) private readonly repository: TelemetryRepository,
  ) {}

  evaluate(now = new Date()): Promise<number> {
    return runSerializable(this.prisma, (transaction) =>
      this.repository.openMissingHeartbeatIncidents(transaction, now),
    );
  }
}
