import { HEARTBEAT_DEFAULT_INTERVAL_MS } from '@blackbox/contracts';
import type { FactoryProvider, ModuleMetadata } from '@nestjs/common';

export interface BlackboxDiagnostic {
  readonly code: 'configuration_invalid' | 'delivery_failed' | 'event_dropped' | 'ingest_rejected';
  readonly message: string;
}

export interface BlackboxModuleOptions {
  readonly bufferSize?: number;
  readonly controlPlaneUrl: string;
  readonly diagnostic?: (diagnostic: BlackboxDiagnostic) => void;
  readonly heartbeatIntervalMs?: number;
  readonly ingestKey: string;
  readonly requestTimeoutMs?: number;
  readonly retryCount?: number;
  readonly serviceName: string;
  readonly serviceVersion?: string;
}

export interface BlackboxModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  readonly inject?: FactoryProvider['inject'];
  readonly useFactory: (
    ...dependencies: never[]
  ) => BlackboxModuleOptions | Promise<BlackboxModuleOptions>;
}

export interface NormalizedBlackboxOptions {
  readonly bufferSize: number;
  readonly controlPlaneUrl: string;
  readonly diagnostic?: (diagnostic: BlackboxDiagnostic) => void;
  readonly heartbeatIntervalMs: number;
  readonly ingestKey: string;
  readonly requestTimeoutMs: number;
  readonly retryCount: number;
  readonly serviceName: string;
  readonly serviceVersion?: string;
}

export const BLACKBOX_OPTIONS = Symbol('BLACKBOX_OPTIONS');
export const DEFAULT_BLACKBOX_OPTIONS = Object.freeze({
  bufferSize: 100,
  heartbeatIntervalMs: HEARTBEAT_DEFAULT_INTERVAL_MS,
  requestTimeoutMs: 2_000,
  retryCount: 3,
});
