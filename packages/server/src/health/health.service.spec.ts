import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service';
import type { ReadinessProbe } from './health.types';

function probe(check: ReadinessProbe['check']): ReadinessProbe {
  return { check };
}

describe('HealthService', () => {
  it('reports liveness independently of dependency state', () => {
    const service = new HealthService(probe(vi.fn()), probe(vi.fn()));

    expect(service.getLiveness()).toEqual({ status: 'ok' });
  });

  it('reports ready only when both dependencies respond', async () => {
    const service = new HealthService(probe(vi.fn()), probe(vi.fn()));

    await expect(service.getReadiness()).resolves.toEqual({
      dependencies: {
        postgres: { status: 'ready' },
        redis: { status: 'ready' },
      },
      status: 'ready',
    });
  });

  it('reports degraded without exposing dependency errors', async () => {
    const service = new HealthService(
      probe(vi.fn().mockRejectedValue(new Error('secret connection details'))),
      probe(vi.fn()),
    );

    await expect(service.getReadiness()).resolves.toEqual({
      dependencies: {
        postgres: { status: 'unavailable' },
        redis: { status: 'ready' },
      },
      status: 'degraded',
    });
  });
});
