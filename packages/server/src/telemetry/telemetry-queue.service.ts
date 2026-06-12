import type { ServerConfig } from '@blackbox/config';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { SERVER_CONFIG } from '../health/health.constants';
import { redisConnectionOptions } from './redis-connection';
import { TELEMETRY_QUEUE_MAX_DEPTH, TELEMETRY_QUEUE_NAME } from './telemetry.constants';
import type { HeartbeatJob } from './telemetry.types';

@Injectable()
export class TelemetryQueueService implements OnModuleDestroy {
  private readonly config: ServerConfig;
  private queue?: Queue<HeartbeatJob>;

  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    this.config = config;
  }

  async enqueue(job: HeartbeatJob): Promise<void> {
    const queue = this.getQueue();
    try {
      if (await queue.getJob(job.batch.batchId)) {
        return;
      }
      const depth =
        (await queue.getWaitingCount()) +
        (await queue.getActiveCount()) +
        (await queue.getDelayedCount());
      if (depth >= TELEMETRY_QUEUE_MAX_DEPTH) {
        throw new ServiceUnavailableException('Telemetry queue is at capacity');
      }
      await queue.add('heartbeat-batch', job, { jobId: job.batch.batchId });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('Telemetry ingestion temporarily unavailable');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private getQueue(): Queue<HeartbeatJob> {
    if (this.queue) {
      return this.queue;
    }
    this.queue = new Queue<HeartbeatJob>(TELEMETRY_QUEUE_NAME, {
      connection: redisConnectionOptions(this.config.redisUrl),
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 1_000, type: 'exponential' },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: TELEMETRY_QUEUE_MAX_DEPTH },
      },
    });
    this.queue.on('error', () => undefined);
    return this.queue;
  }
}
