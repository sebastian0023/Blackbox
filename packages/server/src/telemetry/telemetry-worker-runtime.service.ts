import type { ServerConfig } from '@blackbox/config';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { SERVER_CONFIG } from '../health/health.constants';
import { MissingHeartbeatEvaluatorService } from './missing-heartbeat-evaluator.service';
import { redisConnectionOptions } from './redis-connection';
import { TELEMETRY_QUEUE_NAME } from './telemetry.constants';
import { TelemetryProcessorService } from './telemetry-processor.service';
import type { TelemetryJob } from './telemetry.types';

@Injectable()
export class TelemetryWorkerRuntimeService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(TelemetryWorkerRuntimeService.name);
  private readonly worker: Worker<TelemetryJob>;
  private evaluationTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(SERVER_CONFIG) config: ServerConfig,
    @Inject(TelemetryProcessorService) processor: TelemetryProcessorService,
    @Inject(MissingHeartbeatEvaluatorService)
    private readonly evaluator: MissingHeartbeatEvaluatorService,
  ) {
    this.worker = new Worker<TelemetryJob>(
      TELEMETRY_QUEUE_NAME,
      async (job) => processor.process(job.data),
      {
        concurrency: 10,
        connection: redisConnectionOptions(config.redisUrl, true),
      },
    );
    this.worker.on('error', (error) => this.logger.error(error.message));
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Telemetry job ${job?.id ?? 'unknown'} failed: ${error.message}`),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.evaluate();
    this.evaluationTimer = setInterval(() => void this.evaluate(), 5_000);
    this.evaluationTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
    }
    await this.worker.close();
  }

  private async evaluate(): Promise<void> {
    try {
      await this.evaluator.evaluate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown evaluation failure';
      this.logger.error(`Missing-heartbeat evaluation failed: ${message}`);
    }
  }
}
