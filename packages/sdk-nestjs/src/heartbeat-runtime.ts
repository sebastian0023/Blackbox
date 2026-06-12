import {
  HEARTBEAT_CONTRACT_VERSION,
  HEARTBEAT_MAX_BATCH_EVENTS,
  HEARTBEAT_MAX_INTERVAL_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
  type HeartbeatBatch,
  type HeartbeatEvent,
} from '@blackbox/contracts';
import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  DEFAULT_BLACKBOX_OPTIONS,
  type BlackboxDiagnostic,
  type BlackboxModuleOptions,
  type NormalizedBlackboxOptions,
} from './blackbox-options';

interface RuntimeDependencies {
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly randomJitterMs: () => number;
  readonly setInterval: typeof setInterval;
  readonly uptimeMs: () => number;
}

const MAX_BUFFER_SIZE = 1_000;
const MAX_REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_COUNT = 3;

export class HeartbeatRuntime {
  private readonly buffer: HeartbeatEvent[] = [];
  private readonly dependencies: RuntimeDependencies;
  private readonly options: BlackboxModuleOptions;
  private activeFlush?: Promise<void>;
  private normalized?: NormalizedBlackboxOptions;
  private timer?: ReturnType<typeof setInterval>;

  constructor(options: BlackboxModuleOptions, dependencies: Partial<RuntimeDependencies> = {}) {
    this.options = options;
    this.dependencies = {
      fetch,
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
    try {
      this.normalized = normalizeOptions(this.options);
      this.timer = this.dependencies.setInterval(() => {
        void this.collectAndFlush();
      }, this.normalized.heartbeatIntervalMs);
      this.timer.unref?.();
      void this.collectAndFlush();
    } catch {
      this.diagnose({
        code: 'configuration_invalid',
        message: 'Blackbox monitoring is disabled because its configuration is invalid.',
      });
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
      await this.activeFlush;
      await this.flush();
    } catch {
      // Monitoring shutdown is always fail-open.
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

  private collectHeartbeat(): void {
    const options = this.normalized;
    if (!options) {
      return;
    }
    if (this.buffer.length >= options.bufferSize) {
      this.buffer.shift();
      this.diagnose({
        code: 'event_dropped',
        message: 'Blackbox dropped its oldest buffered heartbeat.',
      });
    }
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

  private async flush(): Promise<void> {
    const options = this.normalized;
    if (!options || this.buffer.length === 0) {
      return;
    }
    if (this.activeFlush) {
      return this.activeFlush;
    }

    const activeFlush = this.flushBatch(options);
    this.activeFlush = activeFlush;
    try {
      await activeFlush;
    } finally {
      if (this.activeFlush === activeFlush) {
        this.activeFlush = undefined;
      }
    }
  }

  private async flushBatch(options: NormalizedBlackboxOptions): Promise<void> {
    const events = this.buffer.splice(0, HEARTBEAT_MAX_BATCH_EVENTS);
    const batch: HeartbeatBatch = {
      batchId: randomUUID(),
      events,
      sentAt: this.dependencies.now().toISOString(),
      version: HEARTBEAT_CONTRACT_VERSION,
    };

    const delivered = await this.deliver(options, batch);
    if (!delivered) {
      this.restore(events, options.bufferSize);
    }
  }

  private async deliver(
    options: NormalizedBlackboxOptions,
    batch: HeartbeatBatch,
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
            message: `Blackbox ingestion rejected a heartbeat batch with status ${response.status}.`,
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
      message: 'Blackbox could not deliver a heartbeat batch after bounded retries.',
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

  private restore(events: readonly HeartbeatEvent[], bufferSize: number): void {
    this.buffer.unshift(...events);
    while (this.buffer.length > bufferSize) {
      this.buffer.shift();
      this.diagnose({
        code: 'event_dropped',
        message: 'Blackbox dropped its oldest buffered heartbeat.',
      });
    }
  }
}

function normalizeOptions(options: BlackboxModuleOptions): NormalizedBlackboxOptions {
  const controlPlaneUrl = new URL(options.controlPlaneUrl);
  const bufferSize = options.bufferSize ?? DEFAULT_BLACKBOX_OPTIONS.bufferSize;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? DEFAULT_BLACKBOX_OPTIONS.heartbeatIntervalMs;
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
    !Number.isInteger(requestTimeoutMs) ||
    requestTimeoutMs < 100 ||
    requestTimeoutMs > MAX_REQUEST_TIMEOUT_MS ||
    !Number.isInteger(retryCount) ||
    retryCount < 1 ||
    retryCount > MAX_RETRY_COUNT ||
    !options.ingestKey ||
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
    requestTimeoutMs,
    retryCount,
    serviceName,
    ...(serviceVersion ? { serviceVersion } : {}),
  });
}
