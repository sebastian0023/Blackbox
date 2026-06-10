import type { ServerConfig } from '@blackbox/config';
import type { ReadinessProbe } from '@blackbox/server';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterEach, describe, it, vi } from 'vitest';
import { ApiAppModule } from '../../apps/api/src/api-app.module';

const config: ServerConfig = {
  apiHost: '127.0.0.1',
  apiPort: 3000,
  databaseUrl: 'postgresql://blackbox:blackbox@localhost:5432/blackbox',
  dependencyTimeoutMs: 200,
  nodeEnv: 'test',
  redisUrl: 'redis://localhost:6379',
};

function probe(check: ReadinessProbe['check']): ReadinessProbe {
  return { check };
}

describe('API health endpoints', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('serves versioned liveness and readiness responses', async () => {
    app = await NestFactory.create(
      ApiAppModule.register({
        config,
        probes: {
          postgres: probe(vi.fn()),
          redis: probe(vi.fn()),
        },
      }),
      { logger: false },
    );
    await app.listen(0, '127.0.0.1');

    await request(app.getHttpServer()).get('/v1/health/live').expect(200, { status: 'ok' });
    await request(app.getHttpServer())
      .get('/v1/health/ready')
      .expect(200, {
        dependencies: {
          postgres: { status: 'ready' },
          redis: { status: 'ready' },
        },
        status: 'ready',
      });
  });

  it('returns service unavailable when a dependency is unavailable', async () => {
    app = await NestFactory.create(
      ApiAppModule.register({
        config,
        probes: {
          postgres: probe(vi.fn().mockRejectedValue(new Error('unavailable'))),
          redis: probe(vi.fn()),
        },
      }),
      { logger: false },
    );
    await app.listen(0, '127.0.0.1');

    await request(app.getHttpServer()).get('/v1/health/live').expect(200);
    await request(app.getHttpServer())
      .get('/v1/health/ready')
      .expect(503, {
        dependencies: {
          postgres: { status: 'unavailable' },
          redis: { status: 'ready' },
        },
        status: 'degraded',
      });
  });
});
