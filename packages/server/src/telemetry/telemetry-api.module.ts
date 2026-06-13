import type { ServerConfig } from '@blackbox/config';
import { Module, type DynamicModule } from '@nestjs/common';
import { SERVER_CONFIG } from '../health/health.constants';
import { PrismaService } from '../infrastructure/prisma.service';
import { HeartbeatQueryController } from './heartbeat-query.controller';
import { HeartbeatQueryService } from './heartbeat-query.service';
import { ErrorQueryController } from './error-query.controller';
import { ErrorQueryService } from './error-query.service';
import { LogQueryController } from './log-query.controller';
import { LogQueryService } from './log-query.service';
import { ProcessMetricQueryController } from './process-metric-query.controller';
import { ProcessMetricQueryService } from './process-metric-query.service';
import { TelemetryIngestionController } from './telemetry-ingestion.controller';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import { TelemetryQueueService } from './telemetry-queue.service';
import { TelemetryRepository } from './telemetry.repository';
import { TelemetrySessionGuard } from './telemetry-auth';

@Module({})
export class TelemetryApiModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      module: TelemetryApiModule,
      controllers: [
        ErrorQueryController,
        HeartbeatQueryController,
        LogQueryController,
        ProcessMetricQueryController,
        TelemetryIngestionController,
      ],
      providers: [
        { provide: SERVER_CONFIG, useValue: config },
        HeartbeatQueryService,
        ErrorQueryService,
        LogQueryService,
        ProcessMetricQueryService,
        PrismaService,
        TelemetryIngestionService,
        TelemetryQueueService,
        TelemetryRepository,
        TelemetrySessionGuard,
      ],
    };
  }
}
