import type { HeartbeatBatch } from '@blackbox/contracts';

export interface HeartbeatJob {
  readonly batch: HeartbeatBatch;
  readonly environmentId: string;
  readonly ingestKeyId: string;
}

export interface HeartbeatCursor {
  readonly eventId: string;
  readonly occurredAt: string;
}
