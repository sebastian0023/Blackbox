import {
  HEARTBEAT_MAX_INTERVAL_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
  PROCESS_METRIC_MAX_INTERVAL_MS,
  PROCESS_METRIC_MIN_INTERVAL_MS,
  TELEMETRY_CONTRACT_VERSION,
  TELEMETRY_EVENT_MAX_BYTES,
  TELEMETRY_MAX_BATCH_BYTES,
  TELEMETRY_MAX_BATCH_EVENTS,
  type ErrorSource,
  type LogLevel,
  type TelemetryBatch,
  type TelemetryEvent,
} from '@blackbox/contracts';
import { randomInt, randomUUID } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import {
  DEFAULT_BLACKBOX_OPTIONS,
  type BlackboxDiagnostic,
  type BlackboxModuleOptions,
  type NormalizedBlackboxOptions,
} from './blackbox-options';
import {
  type MetadataPolicy,
  normalizeContext,
  normalizeError,
  normalizeMessage,
  normalizeMetadata,
  normalizePolicy,
} from './telemetry-normalizer';

interface RuntimeDependencies {
  readonly cpuUsage: () => NodeJS.CpuUsage;
  readonly eventLoopDelay: EventLoopDelayMonitor;
  readonly fetch: typeof fetch;
  readonly hrtimeNs: () => bigint;
  readonly memoryUsage: () => NodeJS.MemoryUsage;
  readonly now: () => Date;
  readonly randomJitterMs: () => number;
  readonly setInterval: typeof setInterval;
  readonly uptimeMs: () => number;
}

interface EventLoopDelayMonitor {
  disable(): boolean;
  enable(): boolean;
  percentile(percentile: number): number;
  reset(): void;
}

const MAX_BUFFER_SIZE = 1_000;
const MAX_REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_COUNT = 3;

export class HeartbeatRuntime {
  private readonly buffer: TelemetryEvent[] = [];
  private readonly dependencies: RuntimeDependencies;
  private readonly options: BlackboxModuleOptions;
  private activeFlush?: Promise<void>;
  private droppedEventCount = 0;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private metricTimer?: ReturnType<typeof setInterval>;
  private metadataPolicy?: MetadataPolicy;
  private monitorInstalled = false;
  private normalized?: NormalizedBlackboxOptions;
  private previousCpuAtNs = 0n;
  private previousCpuUsage: NodeJS.CpuUsage = { system: 0, user: 0 };
  private started = false;
  private readonly uncaughtExceptionMonitor = (
    error: Error,
    origin: NodeJS.UncaughtExceptionOrigin,
  ): void => {
    this.captureError(
      error,
      undefined,
      origin === 'unhandledRejection' ? 'unhandled_rejection' : 'uncaught_exception',
    );
  };

  constructor(options: BlackboxModuleOptions, dependencies: Partial<RuntimeDependencies> = {}) {
    this.options = options;
    this.dependencies = {
      cpuUsage: () => process.cpuUsage(),
      eventLoopDelay: monitorEventLoopDelay({ resolution: 20 }),
      fetch,
      hrtimeNs: () => process.hrtime.bigint(),
      memoryUsage: () => process.memoryUsage(),
      now: () => new Date(),
      randomJitterMs: () => randomInt(25, 101),
      setInterval,
      uptimeMs: () => Math.floor(process.uptime() * 1_000),
      ...dependencies,
    };
  }

  get bufferedEventCount(): number {
    return this.buffer.length;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    try {
      this.normalized = normalizeOptions(this.options);
      this.metadataPolicy = normalizePolicy(
        this.normalized.metadataAllowlist,
        this.normalized.redactionKeys,
      );
      this.previousCpuAtNs = this.dependencies.hrtimeNs();
      this.previousCpuUsage = this.dependencies.cpuUsage();
      this.dependencies.eventLoopDelay.enable();
      this.heartbeatTimer = this.dependencies.setInterval(() => {
        void this.collectAndFlush();
      }, this.normalized.heartbeatIntervalMs);
      this.metricTimer = this.dependencies.setInterval(() => {
        void this.collectMetricsAndFlush();
      }, this.normalized.processMetricsIntervalMs);
      this.heartbeatTimer.unref?.();
      this.metricTimer.unref?.();
      process.on('uncaughtExceptionMonitor', this.uncaughtExceptionMonitor);
      this.monitorInstalled = true;
      this.started = true;
      void this.collectAndFlush();
    } catch {
      this.removeMonitor();
      this.clearTimers();
      this.disableEventLoopMonitor();
      this.normalized = undefined;
      this.metadataPolicy = undefined;
      this.diagnose({
        code: 'configuration_invalid',
        message: 'Blackbox monitoring is disabled because its configuration is invalid.',
      });
    }
  }

  async stop(): Promise<void> {
    this.clearTimers();
    this.removeMonitor();
    this.disableEventLoopMonitor();
    try {
      await this.activeFlush;
      await this.flush();
    } catch {
      // Monitoring shutdown is always fail-open.
    } finally {
      this.started = false;
      this.normalized = undefined;
      this.metadataPolicy = undefined;
    }
  }

  async collectAndFlush(): Promise<void> {
    try {
      this.collectHeartbeat();
      await this.flush();
    } catch {
      // Collection and delivery are always fail-open.
    }
  }

  async collectMetricsAndFlush(): Promise<void> {
    try {
      this.collectProcessMetric();
      await this.flush();
    } catch {
      // Collection and delivery are always fail-open.
    }
  }

  captureError(
    error: unknown,
    metadata?: unknown,
    source: ErrorSource = 'uncaught_exception',
  ): void {
    try {
      const options = this.normalized;
      const policy = this.metadataPolicy;
      if (!options || !policy) {
        return;
      }
      const normalized = normalizeError(error);
      const normalizedMetadata = normalizeMetadata(metadata, policy);
      this.enqueue({
        eventId: randomUUID(),
        message: normalized.message,
        ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
        name: normalized.name,
        occurredAt: this.dependencies.now().toISOString(),
        serviceName: options.serviceName,
        ...(options.serviceVersion ? { serviceVersion: options.serviceVersion } : {}),
        source,
        ...(normalized.stack ? { stack: normalized.stack } : {}),
        type: 'error',
      });
      void this.flush();
    } catch {
      // Capturing errors is always fail-open.
    }
  }

  captureLog(level: LogLevel, message: unknown, metadata?: unknown, context?: unknown): void {
    try {
      const options = this.normalized;
      const policy = this.metadataPolicy;
      if (!options || !policy) {
        return;
      }
      const normalizedMetadata = normalizeMetadata(metadata, policy);
      const normalizedContext = normalizeContext(context);
      this.enqueue({
        ...(normalizedContext ? { context: normalizedContext } : {}),
        eventId: randomUUID(),
        level,
        message: normalizeMessage(message),
        ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
        occurredAt: this.dependencies.now().toISOString(),
        serviceName: options.serviceName,
        ...(options.serviceVersion ? { serviceVersion: options.serviceVersion } : {}),
        type: 'log',
      });
      void this.flush();
    } catch {
      // Capturing logs is always fail-open.
    }
  }

  private collectHeartbeat(): void {
    const options = this.normalized;
    if (!options) {
      return;
    }
    this.makeRoom(options.bufferSize);
    this.buffer.push({
      eventId: randomUUID(),
      expectedIntervalMs: options.heartbeatIntervalMs,
      occurredAt: this.dependencies.now().toISOString(),
      serviceName: options.serviceName,
      ...(options.serviceVersion ? { serviceVersion: options.serviceVersion } : {}),
      type: 'heartbeat',
      uptimeMs: this.dependencies.uptimeMs(),
    });
  }

  private collectProcessMetric(): void {
    const options = this.normalized;
    if (!options) {
      return;
    }

    const cpuAtNs = this.dependencies.hrtimeNs();
    const cpuUsage = this.dependencies.cpuUsage();
    const elapsedMicros = Number((cpuAtNs - this.previousCpuAtNs) / 1_000n);
    const usedMicros =
      cpuUsage.user - this.previousCpuUsage.user + (cpuUsage.system - this.previousCpuUsage.system);
    this.previousCpuAtNs = cpuAtNs;
    this.previousCpuUsage = cpuUsage;

    this.makeRoom(options.bufferSize);
    const eventLoopDelayP99Ms = this.dependencies.eventLoopDelay.percentile(99) / 1_000_000;
    this.dependencies.eventLoopDelay.reset();
    this.buffer.push({
      cpuPercent: round(Math.max(0, elapsedMicros > 0 ? (usedMicros / elapsedMicros) * 100 : 0)),
      droppedEvents: this.droppedEventCount,
      eventId: randomUUID(),
      eventLoopDelayP99Ms: round(
        Number.isFinite(eventLoopDelayP99Ms) ? Math.max(0, eventLoopDelayP99Ms) : 0,
      ),
      occurredAt: this.dependencies.now().toISOString(),
      rssBytes: this.dependencies.memoryUsage().rss,
      serviceName: options.serviceName,
      ...(options.serviceVersion ? { serviceVersion: options.serviceVersion } : {}),
      type: 'process_metric',
      uptimeMs: this.dependencies.uptimeMs(),
    });
  }

  private async flush(): Promise<void> {
    const options = this.normalized;
    if (!options || this.buffer.length === 0) {
      return;
    }
    if (this.activeFlush) {
      await this.activeFlush;
      return;
    }

    const activeFlush = this.drain(options);
    this.activeFlush = activeFlush;
    try {
      await activeFlush;
    } finally {
      if (this.activeFlush === activeFlush) {
        this.activeFlush = undefined;
      }
    }
  }

  private async drain(options: NormalizedBlackboxOptions): Promise<void> {
    const maxBatches = options.bufferSize;
    for (let batch = 0; batch < maxBatches && this.buffer.length > 0; batch += 1) {
      if (!(await this.flushBatch(options))) {
        return;
      }
    }
  }

  private async flushBatch(options: NormalizedBlackboxOptions): Promise<boolean> {
    const events: TelemetryEvent[] = [];
    const batch: TelemetryBatch = {
      batchId: randomUUID(),
      events,
      sentAt: this.dependencies.now().toISOString(),
      version: TELEMETRY_CONTRACT_VERSION,
    };
    while (events.length < TELEMETRY_MAX_BATCH_EVENTS && this.buffer.length > 0) {
      const next = this.buffer[0];
      if (!next) {
        break;
      }
      events.push(next);
      if (Buffer.byteLength(JSON.stringify(batch), 'utf8') > TELEMETRY_MAX_BATCH_BYTES) {
        events.pop();
        break;
      }
      this.buffer.shift();
    }

    const delivered = await this.deliver(options, batch);
    if (!delivered) {
      this.restore(events, options.bufferSize);
    }
    return delivered;
  }

  private async deliver(
    options: NormalizedBlackboxOptions,
    batch: TelemetryBatch,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= options.retryCount; attempt += 1) {
      try {
        const response = await this.dependencies.fetch(
          `${options.controlPlaneUrl}/v1/ingest/batches`,
          {
            body: JSON.stringify(batch),
            headers: {
              'Content-Type': 'application/json',
              'X-Blackbox-Ingest-Key': options.ingestKey,
            },
            method: 'POST',
            signal: AbortSignal.timeout(options.requestTimeoutMs),
          },
        );

        if (response.ok) {
          return true;
        }
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          this.diagnose({
            code: 'ingest_rejected',
            message: `Blackbox ingestion rejected a telemetry batch with status ${response.status}.`,
          });
          return true;
        }
      } catch {
        // A bounded retry below handles network and timeout failures.
      }

      if (attempt < options.retryCount) {
        await delay(attempt * 100 + this.dependencies.randomJitterMs());
      }
    }

    this.diagnose({
      code: 'delivery_failed',
      message: 'Blackbox could not deliver a telemetry batch after bounded retries.',
    });
    return false;
  }

  private diagnose(diagnostic: BlackboxDiagnostic): void {
    try {
      this.options.diagnostic?.(diagnostic);
    } catch {
      // Diagnostics must never recursively fail into the host application.
    }
  }

  private disableEventLoopMonitor(): void {
    try {
      this.dependencies.eventLoopDelay.disable();
    } catch {
      // Monitoring cleanup is always fail-open.
    }
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.metricTimer) {
      clearInterval(this.metricTimer);
      this.metricTimer = undefined;
    }
  }

  private makeRoom(bufferSize: number): void {
    if (this.buffer.length < bufferSize) {
      return;
    }
    this.buffer.shift();
    this.recordDroppedEvent();
  }

  private enqueue(event: TelemetryEvent): void {
    const options = this.normalized;
    if (!options) {
      return;
    }
    if (Buffer.byteLength(JSON.stringify(event), 'utf8') > TELEMETRY_EVENT_MAX_BYTES) {
      this.recordDroppedEvent();
      return;
    }
    this.makeRoom(options.bufferSize);
    this.buffer.push(event);
  }

  private restore(events: readonly TelemetryEvent[], bufferSize: number): void {
    this.buffer.unshift(...events);
    while (this.buffer.length > bufferSize) {
      this.buffer.shift();
      this.recordDroppedEvent();
    }
  }

  private recordDroppedEvent(): void {
    this.droppedEventCount = Math.min(Number.MAX_SAFE_INTEGER, this.droppedEventCount + 1);
    this.diagnose({
      code: 'event_dropped',
      message: 'Blackbox dropped its oldest buffered telemetry event.',
    });
  }

  private removeMonitor(): void {
    if (!this.monitorInstalled) {
      return;
    }
    process.off('uncaughtExceptionMonitor', this.uncaughtExceptionMonitor);
    this.monitorInstalled = false;
  }
}

function normalizeOptions(options: BlackboxModuleOptions): NormalizedBlackboxOptions {
  const controlPlaneUrl = new URL(options.controlPlaneUrl);
  const bufferSize = options.bufferSize ?? DEFAULT_BLACKBOX_OPTIONS.bufferSize;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? DEFAULT_BLACKBOX_OPTIONS.heartbeatIntervalMs;
  const processMetricsIntervalMs =
    options.processMetricsIntervalMs ?? DEFAULT_BLACKBOX_OPTIONS.processMetricsIntervalMs;
  const metadataAllowlist = options.metadataAllowlist ?? [];
  const redactionKeys = [
    ...DEFAULT_BLACKBOX_OPTIONS.redactionKeys,
    ...(options.redactionKeys ?? []),
  ];
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_BLACKBOX_OPTIONS.requestTimeoutMs;
  const retryCount = options.retryCount ?? DEFAULT_BLACKBOX_OPTIONS.retryCount;
  const serviceName = options.serviceName.trim();
  const serviceVersion = options.serviceVersion?.trim();

  if (!['http:', 'https:'].includes(controlPlaneUrl.protocol)) {
    throw new Error('Unsupported control-plane URL');
  }
  if (
    !Number.isInteger(bufferSize) ||
    bufferSize < 1 ||
    bufferSize > MAX_BUFFER_SIZE ||
    !Number.isInteger(heartbeatIntervalMs) ||
    heartbeatIntervalMs < HEARTBEAT_MIN_INTERVAL_MS ||
    heartbeatIntervalMs > HEARTBEAT_MAX_INTERVAL_MS ||
    !Number.isInteger(processMetricsIntervalMs) ||
    processMetricsIntervalMs < PROCESS_METRIC_MIN_INTERVAL_MS ||
    processMetricsIntervalMs > PROCESS_METRIC_MAX_INTERVAL_MS ||
    !Number.isInteger(requestTimeoutMs) ||
    requestTimeoutMs < 100 ||
    requestTimeoutMs > MAX_REQUEST_TIMEOUT_MS ||
    !Number.isInteger(retryCount) ||
    retryCount < 1 ||
    retryCount > MAX_RETRY_COUNT ||
    !options.ingestKey ||
    !validStringList(metadataAllowlist) ||
    !validStringList(redactionKeys) ||
    !serviceName ||
    serviceName.length > 100 ||
    (serviceVersion !== undefined && (!serviceVersion || serviceVersion.length > 100))
  ) {
    throw new Error('Invalid Blackbox SDK option');
  }

  return Object.freeze({
    bufferSize,
    controlPlaneUrl: controlPlaneUrl.toString().replace(/\/$/u, ''),
    diagnostic: options.diagnostic,
    heartbeatIntervalMs,
    ingestKey: options.ingestKey,
    metadataAllowlist: [...new Set(metadataAllowlist)],
    processMetricsIntervalMs,
    redactionKeys: [...new Set(redactionKeys)],
    requestTimeoutMs,
    retryCount,
    serviceName,
    ...(serviceVersion ? { serviceVersion } : {}),
  });
}

function validStringList(value: readonly string[]): boolean {
  return value.length <= 100 && value.every((item) => item.length > 0 && item.length <= 100);
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
