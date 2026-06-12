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
