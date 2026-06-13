import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeartbeatRuntime } from './heartbeat-runtime';

const baseOptions = {
  controlPlaneUrl: 'https://blackbox.example',
  heartbeatIntervalMs: 5_000,
  ingestKey: 'bbx_test_secret',
  requestTimeoutMs: 100,
  retryCount: 1,
  serviceName: 'checkout',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('HeartbeatRuntime', () => {
  it('schedules and sends conservative heartbeat-only batches', async () => {
    vi.useFakeTimers();
    const requests: Array<{ body: unknown; headers: HeadersInit }> = [];
    const runtime = new HeartbeatRuntime(baseOptions, {
      fetch: vi.fn(async (_url, init) => {
        requests.push({ body: JSON.parse(String(init?.body)), headers: init?.headers ?? {} });
        return new Response(null, { status: 202 });
      }),
      now: () => new Date('2026-06-11T12:00:00.000Z'),
      uptimeMs: () => 12_345,
    });

    await runtime.start();
    await vi.advanceTimersByTimeAsync(5_000);
    await runtime.stop();

    expect(requests).toHaveLength(2);
    expect(requests[0]?.headers).toMatchObject({ 'X-Blackbox-Ingest-Key': baseOptions.ingestKey });
    const first = requests[0]?.body as { events: Array<Record<string, unknown>> };
    expect(first.events[0]).toMatchObject({
      expectedIntervalMs: 5_000,
      occurredAt: '2026-06-11T12:00:00.000Z',
      serviceName: 'checkout',
      type: 'heartbeat',
      uptimeMs: 12_345,
    });
    expect(Object.keys(first.events[0] ?? {}).sort()).toEqual([
      'eventId',
      'expectedIntervalMs',
      'occurredAt',
      'serviceName',
      'type',
      'uptimeMs',
    ]);
  });

  it('bounds its memory buffer, drops oldest events, and remains fail-open', async () => {
    const diagnostics: string[] = [];
    const runtime = new HeartbeatRuntime(
      {
        ...baseOptions,
        bufferSize: 2,
        diagnostic: ({ code }) => diagnostics.push(code),
      },
      { fetch: vi.fn(async () => Promise.reject(new Error('offline'))) },
    );

    await expect(runtime.start()).resolves.toBeUndefined();
    await expect(runtime.collectAndFlush()).resolves.toBeUndefined();
    await expect(runtime.collectAndFlush()).resolves.toBeUndefined();
    await expect(runtime.stop()).resolves.toBeUndefined();

    expect(runtime.bufferedEventCount).toBe(2);
    expect(diagnostics).toContain('delivery_failed');
    expect(diagnostics).toContain('event_dropped');
  });

  it('collects only the approved process metrics and batches them with contract version 1', async () => {
    const requests: Array<{ events: Array<Record<string, unknown>>; version: number }> = [];
    const eventLoopDelay = {
      disable: vi.fn(() => true),
      enable: vi.fn(() => true),
      percentile: vi.fn(() => 12_500_000),
      reset: vi.fn(),
    };
    let cpuCall = 0;
    let timeCall = 0;
    const runtime = new HeartbeatRuntime(
      { ...baseOptions, serviceVersion: '1.0.0' },
      {
        cpuUsage: () =>
          cpuCall++ === 0 ? { system: 0, user: 0 } : { system: 100_000, user: 100_000 },
        eventLoopDelay,
        fetch: vi.fn(async (_url, init) => {
          requests.push(JSON.parse(String(init?.body)));
          return new Response(null, { status: 202 });
        }),
        hrtimeNs: () => (timeCall++ === 0 ? 0n : 1_000_000_000n),
        memoryUsage: () => ({ arrayBuffers: 0, external: 0, heapTotal: 0, heapUsed: 0, rss: 4096 }),
        now: () => new Date('2026-06-12T12:00:00.000Z'),
        uptimeMs: () => 12_345,
      },
    );

    await runtime.start();
    await runtime.collectMetricsAndFlush();
    await runtime.stop();

    const metric = requests
      .flatMap(({ events }) => events)
      .find(({ type }) => type === 'process_metric');
    expect(metric).toMatchObject({
      cpuPercent: 20,
      droppedEvents: 0,
      eventLoopDelayP99Ms: 12.5,
      occurredAt: '2026-06-12T12:00:00.000Z',
      rssBytes: 4096,
      serviceName: 'checkout',
      serviceVersion: '1.0.0',
      type: 'process_metric',
      uptimeMs: 12_345,
    });
    expect(Object.keys(metric ?? {}).sort()).toEqual([
      'cpuPercent',
      'droppedEvents',
      'eventId',
      'eventLoopDelayP99Ms',
      'occurredAt',
      'rssBytes',
      'serviceName',
      'serviceVersion',
      'type',
      'uptimeMs',
    ]);
    expect(requests.every(({ version }) => version === 1)).toBe(true);
    expect(eventLoopDelay.enable).toHaveBeenCalledOnce();
    expect(eventLoopDelay.reset).toHaveBeenCalledOnce();
    expect(eventLoopDelay.disable).toHaveBeenCalledOnce();
  });

  it('captures only allowlisted and recursively redacted log and error metadata', async () => {
    const requests: Array<{ events: Array<Record<string, unknown>> }> = [];
    const runtime = new HeartbeatRuntime(
      {
        ...baseOptions,
        metadataAllowlist: ['safe'],
      },
      {
        fetch: vi.fn(async (_url, init) => {
          requests.push(JSON.parse(String(init?.body)));
          return new Response(null, { status: 202 });
        }),
      },
    );

    await runtime.start();
    runtime.captureLog(
      'warn',
      'payment failed',
      {
        ignored: 'must-not-leave',
        safe: { password: 'plain-secret', requestId: 'req-1' },
      },
      'Checkout',
    );
    runtime.captureError(new Error('boom'), { safe: { token: 'plain-token' } });
    await runtime.stop();

    const events = requests.flatMap(({ events: batchEvents }) => batchEvents);
    expect(events.find(({ type }) => type === 'log')).toMatchObject({
      context: 'Checkout',
      level: 'warn',
      message: 'payment failed',
      metadata: { safe: { password: '[REDACTED]', requestId: 'req-1' } },
      type: 'log',
    });
    expect(events.find(({ type }) => type === 'error')).toMatchObject({
      message: 'boom',
      metadata: { safe: { token: '[REDACTED]' } },
      name: 'Error',
      source: 'uncaught_exception',
      type: 'error',
    });
    expect(JSON.stringify(events)).not.toContain('plain-secret');
    expect(JSON.stringify(events)).not.toContain('plain-token');
    expect(JSON.stringify(events)).not.toContain('must-not-leave');
  });

  it('always retains mandatory redaction keys when custom keys are configured', async () => {
    const requests: Array<{ events: Array<Record<string, unknown>> }> = [];
    const runtime = new HeartbeatRuntime(
      {
        ...baseOptions,
        metadataAllowlist: ['safe'],
        redactionKeys: ['apiKey'],
      },
      {
        fetch: vi.fn(async (_url, init) => {
          requests.push(JSON.parse(String(init?.body)));
          return new Response(null, { status: 202 });
        }),
      },
    );

    await runtime.start();
    runtime.captureLog('log', 'redaction check', {
      safe: { apiKey: 'custom-secret', password: 'mandatory-secret' },
    });
    await runtime.stop();

    const serialized = JSON.stringify(requests);
    expect(serialized).not.toContain('custom-secret');
    expect(serialized).not.toContain('mandatory-secret');
    expect(serialized.match(/\[REDACTED\]/gu)).toHaveLength(2);
  });

  it('installs only a passive uncaught-exception monitor and removes it on shutdown', async () => {
    const unhandledBefore = process.listenerCount('unhandledRejection');
    const monitorBefore = process.listenerCount('uncaughtExceptionMonitor');
    const runtime = new HeartbeatRuntime(baseOptions, {
      fetch: vi.fn(async () => new Response(null, { status: 202 })),
    });

    await runtime.start();
    expect(process.listenerCount('unhandledRejection')).toBe(unhandledBefore);
    expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(monitorBefore + 1);
    await runtime.stop();

    expect(process.listenerCount('unhandledRejection')).toBe(unhandledBefore);
    expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(monitorBefore);
  });

  it('classifies monitor-observed fatal promise rejections without installing a rejection listener', async () => {
    const before = new Set(process.listeners('uncaughtExceptionMonitor'));
    const requests: Array<{ events: Array<Record<string, unknown>> }> = [];
    const runtime = new HeartbeatRuntime(baseOptions, {
      fetch: vi.fn(async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 202 });
      }),
    });

    await runtime.start();
    const monitor = process
      .listeners('uncaughtExceptionMonitor')
      .find((listener) => !before.has(listener));
    expect(monitor).toBeDefined();
    (monitor as (error: Error, origin: NodeJS.UncaughtExceptionOrigin) => void)(
      new Error('fatal rejection'),
      'unhandledRejection',
    );
    await runtime.stop();

    expect(
      requests.flatMap(({ events }) => events).find(({ type }) => type === 'error'),
    ).toMatchObject({ message: 'fatal rejection', source: 'unhandled_rejection' });
  });

  it('keeps delivered telemetry batches within the 100 KiB contract', async () => {
    let finishFirstRequest: ((response: Response) => void) | undefined;
    const firstRequest = new Promise<Response>((resolve) => {
      finishFirstRequest = resolve;
    });
    const bodies: string[] = [];
    const runtime = new HeartbeatRuntime(
      {
        ...baseOptions,
        bufferSize: 100,
        metadataAllowlist: Array.from({ length: 12 }, (_, index) => `key${index}`),
      },
      {
        fetch: vi.fn(async (_url, init) => {
          bodies.push(String(init?.body));
          return bodies.length === 1 ? firstRequest : new Response(null, { status: 202 });
        }),
      },
    );

    await runtime.start();
    const metadata = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`key${index}`, 'x'.repeat(2_048)]),
    );
    for (let index = 0; index < 10; index += 1) {
      runtime.captureLog('log', `message-${index}`, metadata);
    }
    finishFirstRequest?.(new Response(null, { status: 202 }));
    await runtime.stop();

    expect(bodies.length).toBeGreaterThan(2);
    expect(bodies.every((body) => Buffer.byteLength(body, 'utf8') <= 100 * 1_024)).toBe(true);
    expect(
      bodies.reduce(
        (total, body) => total + (JSON.parse(body) as { events: unknown[] }).events.length,
        0,
      ),
    ).toBe(11);
  });

  it('drops individual log events larger than 32 KiB before buffering', async () => {
    const diagnostics: string[] = [];
    const requests: Array<{ events: Array<Record<string, unknown>> }> = [];
    const allowlist = Array.from({ length: 16 }, (_, index) => `key${index}`);
    const runtime = new HeartbeatRuntime(
      {
        ...baseOptions,
        diagnostic: ({ code }) => diagnostics.push(code),
        metadataAllowlist: allowlist,
      },
      {
        fetch: vi.fn(async (_url, init) => {
          requests.push(JSON.parse(String(init?.body)));
          return new Response(null, { status: 202 });
        }),
      },
    );

    await runtime.start();
    runtime.captureLog(
      'log',
      'oversized',
      Object.fromEntries(allowlist.map((key) => [key, 'x'.repeat(2_048)])),
    );
    await runtime.stop();

    expect(requests.flatMap(({ events }) => events).every(({ type }) => type !== 'log')).toBe(true);
    expect(diagnostics).toContain('event_dropped');
  });

  it('reports a cumulative dropped-telemetry count in the next process metric', async () => {
    let offline = true;
    const delivered: Array<{ events: Array<Record<string, unknown>> }> = [];
    const runtime = new HeartbeatRuntime(
      { ...baseOptions, bufferSize: 1 },
      {
        fetch: vi.fn(async (_url, init) => {
          if (offline) {
            throw new Error('offline');
          }
          delivered.push(JSON.parse(String(init?.body)));
          return new Response(null, { status: 202 });
        }),
      },
    );

    await runtime.start();
    await vi.waitFor(() => expect(runtime.bufferedEventCount).toBe(1));
    offline = false;
    await runtime.collectMetricsAndFlush();
    await runtime.stop();

    expect(delivered[0]?.events[0]).toMatchObject({
      droppedEvents: 1,
      type: 'process_metric',
    });
  });

  it('retries transient failures with the same stable batch and stops after success', async () => {
    const batchIds: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const batch = JSON.parse(String(init?.body)) as { batchId: string };
      batchIds.push(batch.batchId);
      return new Response(null, { status: batchIds.length === 1 ? 500 : 202 });
    });
    const runtime = new HeartbeatRuntime(
      { ...baseOptions, retryCount: 3 },
      { fetch: fetchMock, randomJitterMs: () => 0 },
    );

    await runtime.start();
    await runtime.stop();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Set(batchIds).size).toBe(1);
    expect(runtime.bufferedEventCount).toBe(0);
  });

  it('drains telemetry collected during a successful in-flight flush', async () => {
    let finishFirstRequest: ((response: Response) => void) | undefined;
    const firstRequest = new Promise<Response>((resolve) => {
      finishFirstRequest = resolve;
    });
    const deliveredTypes: string[][] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const batch = JSON.parse(String(init?.body)) as { events: Array<{ type: string }> };
      deliveredTypes.push(batch.events.map(({ type }) => type));
      return deliveredTypes.length === 1 ? firstRequest : new Response(null, { status: 202 });
    });
    const runtime = new HeartbeatRuntime(baseOptions, { fetch: fetchMock });

    await runtime.start();
    const metricFlush = runtime.collectMetricsAndFlush();
    finishFirstRequest?.(new Response(null, { status: 202 }));
    await metricFlush;
    await runtime.stop();

    expect(deliveredTypes).toEqual([['heartbeat'], ['process_metric']]);
    expect(runtime.bufferedEventCount).toBe(0);
  });

  it('drains a bounded multi-batch backlog after delivery recovers', async () => {
    let finishFirstRequest: ((response: Response) => void) | undefined;
    const firstRequest = new Promise<Response>((resolve) => {
      finishFirstRequest = resolve;
    });
    const deliveredBatchSizes: number[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const batch = JSON.parse(String(init?.body)) as { events: unknown[] };
      deliveredBatchSizes.push(batch.events.length);
      return deliveredBatchSizes.length === 1 ? firstRequest : new Response(null, { status: 202 });
    });
    const runtime = new HeartbeatRuntime({ ...baseOptions, bufferSize: 250 }, { fetch: fetchMock });

    await runtime.start();
    const concurrentFlushes = Array.from({ length: 204 }, () => runtime.collectAndFlush());
    finishFirstRequest?.(new Response(null, { status: 202 }));
    await Promise.all(concurrentFlushes);
    await runtime.stop();

    expect(deliveredBatchSizes).toEqual([1, 100, 100, 4]);
    expect(runtime.bufferedEventCount).toBe(0);
  });

  it('does not retry rejected credentials or leak the ingest key through diagnostics', async () => {
    const diagnostics: string[] = [];
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    const runtime = new HeartbeatRuntime(
      { ...baseOptions, diagnostic: ({ message }) => diagnostics.push(message), retryCount: 3 },
      { fetch: fetchMock },
    );

    await runtime.start();
    await runtime.stop();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(diagnostics.join('\n')).not.toContain(baseOptions.ingestKey);
    expect(runtime.bufferedEventCount).toBe(0);
  });

  it('disables itself without affecting the host when configuration is invalid', async () => {
    const diagnostics: string[] = [];
    const fetchMock = vi.fn();
    const runtime = new HeartbeatRuntime(
      {
        ...baseOptions,
        controlPlaneUrl: 'file:///etc/passwd',
        diagnostic: ({ code }) => diagnostics.push(code),
      },
      { fetch: fetchMock },
    );

    await expect(runtime.start()).resolves.toBeUndefined();
    await expect(runtime.stop()).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(diagnostics).toEqual(['configuration_invalid']);
  });

  it('rejects process-metric sampling outside the approved bounds without affecting the host', async () => {
    const diagnostics: string[] = [];
    const fetchMock = vi.fn();
    const runtime = new HeartbeatRuntime(
      {
        ...baseOptions,
        diagnostic: ({ code }) => diagnostics.push(code),
        processMetricsIntervalMs: 1_000,
      },
      { fetch: fetchMock },
    );

    await expect(runtime.start()).resolves.toBeUndefined();
    await expect(runtime.collectMetricsAndFlush()).resolves.toBeUndefined();
    await expect(runtime.stop()).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(diagnostics).toEqual(['configuration_invalid']);
  });

  it('does not block host startup while the control plane is unavailable', async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    const pendingRequest = new Promise<Response>((resolve) => {
      finishRequest = resolve;
    });
    const runtime = new HeartbeatRuntime(baseOptions, {
      fetch: vi.fn(() => pendingRequest),
    });

    await expect(runtime.start()).resolves.toBeUndefined();
    finishRequest?.(new Response(null, { status: 202 }));
    await vi.waitFor(() => expect(runtime.bufferedEventCount).toBe(0));
    await runtime.stop();
  });

  it('flushes buffered telemetry during graceful shutdown without throwing', async () => {
    let offline = true;
    const fetchMock = vi.fn(async () =>
      offline
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(new Response(null, { status: 202 })),
    );
    const runtime = new HeartbeatRuntime(baseOptions, { fetch: fetchMock });

    await runtime.start();
    await vi.waitFor(() => expect(runtime.bufferedEventCount).toBe(1));
    offline = false;
    await expect(runtime.stop()).resolves.toBeUndefined();

    expect(runtime.bufferedEventCount).toBe(0);
  });
});
