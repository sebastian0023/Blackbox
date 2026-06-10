import type { ServerConfig } from '@blackbox/config';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiAppModule } from '../../apps/api/src/api-app.module';

const runDependencyIntegration = process.env.RUN_DEPENDENCY_INTEGRATION === 'true';
const describeDependencies = runDependencyIntegration ? describe : describe.skip;

describeDependencies('API dependency readiness', () => {
  let app: INestApplication;
  let availableConfig: ServerConfig;

  beforeAll(async () => {
    availableConfig = {
      apiHost: '127.0.0.1',
      apiPort: 3000,
      databaseUrl:
        process.env.DATABASE_URL ?? 'postgresql://blackbox:blackbox@localhost:5432/blackbox',
      dependencyTimeoutMs: 2000,
      nodeEnv: 'test',
      redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    };

    app = await NestFactory.create(ApiAppModule.register({ config: availableConfig }), {
      logger: false,
    });
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ready when PostgreSQL and Redis are available', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health/ready').expect(200);

    expect(response.body).toEqual({
      dependencies: {
        postgres: { status: 'ready' },
        redis: { status: 'ready' },
      },
      status: 'ready',
    });
  });

  async function expectDegraded(
    config: ServerConfig,
    postgresStatus: 'ready' | 'unavailable',
    redisStatus: 'ready' | 'unavailable',
  ): Promise<void> {
    const unavailableApp = await NestFactory.create(ApiAppModule.register({ config }), {
      logger: false,
    });
    await unavailableApp.listen(0, '127.0.0.1');

    try {
      await request(unavailableApp.getHttpServer())
        .get('/v1/health/ready')
        .expect(503, {
          dependencies: {
            postgres: { status: postgresStatus },
            redis: { status: redisStatus },
          },
          status: 'degraded',
        });
    } finally {
      await unavailableApp.close();
    }
  }

  it('reports only PostgreSQL unavailable when Redis remains available', async () => {
    await expectDegraded(
      {
        ...availableConfig,
        databaseUrl: 'postgresql://blackbox:blackbox@127.0.0.1:1/blackbox',
        dependencyTimeoutMs: 200,
      },
      'unavailable',
      'ready',
    );
  });

  it('reports only Redis unavailable when PostgreSQL remains available', async () => {
    await expectDegraded(
      {
        ...availableConfig,
        dependencyTimeoutMs: 200,
        redisUrl: 'redis://127.0.0.1:1',
      },
      'ready',
      'unavailable',
    );
  });
});
