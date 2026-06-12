import type { ServerConfig } from '@blackbox/config';
import { Module, type DynamicModule } from '@nestjs/common';
import { SERVER_CONFIG } from '../health/health.constants';
import { PrismaService } from '../infrastructure/prisma.service';
import { MissingHeartbeatEvaluatorService } from './missing-heartbeat-evaluator.service';
import { TelemetryProcessorService } from './telemetry-processor.service';
import { TelemetryRepository } from './telemetry.repository';
import { TelemetryWorkerRuntimeService } from './telemetry-worker-runtime.service';

@Module({})
export class TelemetryWorkerModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      module: TelemetryWorkerModule,
      providers: [
        { provide: SERVER_CONFIG, useValue: config },
        MissingHeartbeatEvaluatorService,
        PrismaService,
        TelemetryProcessorService,
        TelemetryRepository,
        TelemetryWorkerRuntimeService,
      ],
    };
  }
}
