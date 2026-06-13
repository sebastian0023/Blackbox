import type { TelemetryBatch } from '@blackbox/contracts';

export interface TelemetryJob {
  readonly batch: TelemetryBatch;
  readonly environmentId: string;
  readonly ingestKeyId: string;
}

export interface HeartbeatCursor {
  readonly eventId: string;
  readonly occurredAt: string;
}

export type ProcessMetricCursor = HeartbeatCursor;
export type ErrorCursor = HeartbeatCursor;
export type LogCursor = HeartbeatCursor;
