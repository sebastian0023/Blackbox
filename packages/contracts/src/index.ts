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

export const TELEMETRY_CONTRACT_VERSION = 1 as const;
export const TELEMETRY_MAX_BATCH_BYTES = 100 * 1_024;
export const TELEMETRY_MAX_BATCH_EVENTS = 100;
export const HEARTBEAT_CONTRACT_VERSION = TELEMETRY_CONTRACT_VERSION;
export const HEARTBEAT_DEFAULT_INTERVAL_MS = 30_000;
export const HEARTBEAT_MAX_BATCH_EVENTS = TELEMETRY_MAX_BATCH_EVENTS;
export const HEARTBEAT_MAX_INTERVAL_MS = 300_000;
export const HEARTBEAT_MIN_INTERVAL_MS = 5_000;
export const PROCESS_METRIC_DEFAULT_INTERVAL_MS = 30_000;
export const PROCESS_METRIC_MAX_INTERVAL_MS = 300_000;
export const PROCESS_METRIC_MIN_INTERVAL_MS = 5_000;
export const TELEMETRY_EVENT_MAX_BYTES = 32 * 1_024;
export const TELEMETRY_METADATA_MAX_ARRAY_ITEMS = 20;
export const TELEMETRY_METADATA_MAX_DEPTH = 5;
export const TELEMETRY_METADATA_MAX_KEYS = 16;
export const TELEMETRY_STRING_MAX_LENGTH = 2_048;
export const TELEMETRY_STACK_MAX_LENGTH = 16 * 1_024;
export const TELEMETRY_CONTEXT_MAX_LENGTH = 100;

export type LogLevel = 'debug' | 'error' | 'fatal' | 'log' | 'verbose' | 'warn';
export type ErrorSource = 'uncaught_exception' | 'unhandled_rejection';
export type TelemetryMetadataValue =
  | boolean
  | number
  | string
  | null
  | readonly TelemetryMetadataValue[]
  | { readonly [key: string]: TelemetryMetadataValue };
export type TelemetryMetadata = Readonly<Record<string, TelemetryMetadataValue>>;

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

export interface ProcessMetricEvent {
  readonly cpuPercent: number;
  readonly droppedEvents: number;
  readonly eventId: string;
  readonly eventLoopDelayP99Ms: number;
  readonly occurredAt: string;
  readonly rssBytes: number;
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly type: 'process_metric';
  readonly uptimeMs: number;
}

export interface LogEvent {
  readonly context?: string;
  readonly eventId: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly metadata?: TelemetryMetadata;
  readonly occurredAt: string;
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly type: 'log';
}

export interface ErrorEvent {
  readonly eventId: string;
  readonly message: string;
  readonly metadata?: TelemetryMetadata;
  readonly name: string;
  readonly occurredAt: string;
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly source: ErrorSource;
  readonly stack?: string;
  readonly type: 'error';
}

export type TelemetryEvent = ErrorEvent | HeartbeatEvent | LogEvent | ProcessMetricEvent;

export interface TelemetryBatch {
  readonly batchId: string;
  readonly events: readonly TelemetryEvent[];
  readonly sentAt: string;
  readonly version: typeof TELEMETRY_CONTRACT_VERSION;
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

export interface ProcessMetricQueryItem {
  readonly cpuPercent: number;
  readonly droppedEvents: number;
  readonly eventId: string;
  readonly eventLoopDelayP99Ms: number;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly rssBytes: number;
  readonly serviceName: string;
  readonly serviceVersion: string | null;
  readonly uptimeMs: number;
}

export interface ProcessMetricQueryResponse {
  readonly items: readonly ProcessMetricQueryItem[];
  readonly nextCursor: string | null;
}

export interface LogQueryItem extends Omit<LogEvent, 'type'> {
  readonly receivedAt: string;
}

export interface LogQueryResponse {
  readonly items: readonly LogQueryItem[];
  readonly nextCursor: string | null;
}

export interface ErrorQueryItem extends Omit<ErrorEvent, 'type'> {
  readonly receivedAt: string;
}

export interface ErrorQueryResponse {
  readonly items: readonly ErrorQueryItem[];
  readonly nextCursor: string | null;
}
