export type DependencyReadinessStatus = 'ready' | 'unavailable';

export interface DependencyReadiness {
  readonly status: DependencyReadinessStatus;
}

export interface LivenessResponse {
  readonly status: 'ok';
}

export interface ReadinessResponse {
  readonly dependencies: {
    readonly postgres: DependencyReadiness;
    readonly redis: DependencyReadiness;
  };
  readonly status: 'ready' | 'degraded';
}

export const HEARTBEAT_CONTRACT_VERSION = 1 as const;
export const HEARTBEAT_DEFAULT_INTERVAL_MS = 30_000;
export const HEARTBEAT_MAX_BATCH_EVENTS = 100;
export const HEARTBEAT_MAX_INTERVAL_MS = 300_000;
export const HEARTBEAT_MIN_INTERVAL_MS = 5_000;

export interface HeartbeatEvent {
  readonly eventId: string;
  readonly expectedIntervalMs: number;
  readonly occurredAt: string;
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly type: 'heartbeat';
  readonly uptimeMs: number;
}

export interface HeartbeatBatch {
  readonly batchId: string;
  readonly events: readonly HeartbeatEvent[];
  readonly sentAt: string;
  readonly version: typeof HEARTBEAT_CONTRACT_VERSION;
}

export interface IngestBatchResponse {
  readonly batchId: string;
  readonly status: 'queued';
}

export interface HeartbeatQueryItem {
  readonly eventId: string;
  readonly expectedIntervalMs: number;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly serviceName: string;
  readonly serviceVersion: string | null;
  readonly uptimeMs: number;
}

export interface HeartbeatQueryResponse {
  readonly items: readonly HeartbeatQueryItem[];
  readonly nextCursor: string | null;
}
