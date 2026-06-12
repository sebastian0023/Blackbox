import type { ServerConfig } from '@blackbox/config';
import { PrismaClient } from '@blackbox/database';
import { MissingHeartbeatEvaluatorService } from '@blackbox/server';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiAppModule } from '../../apps/api/src/api-app.module';
import { ExampleAppModule } from '../../apps/example-nest/src/example-app.module';
import { WorkerAppModule } from '../../apps/worker/src/worker-app.module';

const runDependencyIntegration = process.env.RUN_DEPENDENCY_INTEGRATION === 'true';
const describeDependencies = runDependencyIntegration ? describe : describe.skip;
const password = 'CorrectHorseBattery!23';
const testRunId = randomUUID();

interface Identity {
  readonly agent: ReturnType<typeof request.agent>;
  readonly csrfToken: string;
  readonly email: string;
  readonly teamId: string;
  readonly userId: string;
}

interface IngestFixture {
  readonly environmentId: string;
  readonly ingestKey: string;
  readonly keyId: string;
  readonly projectId: string;
}

function emailFor(localPart: string): string {
  return `${localPart}+${testRunId}@example.com`;
}

describeDependencies('Phase 4 heartbeat vertical slice', () => {
  let api: INestApplication;
  let evaluator: MissingHeartbeatEvaluatorService;
  let prisma: PrismaClient;
  let queue: Queue;
  let redis: Redis;
  let worker: INestApplicationContext;

  const config: ServerConfig = {
    apiHost: '127.0.0.1',
    apiPort: 3000,
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgresql://blackbox:blackbox@localhost:5432/blackbox',
    dependencyTimeoutMs: 500,
    nodeEnv: 'development',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
    redis = new Redis(config.redisUrl);
    queue = new Queue('blackbox-telemetry-ingest-v1', { connection: { url: config.redisUrl } });
    api = await NestFactory.create(ApiAppModule.register({ config }), { logger: false });
    await api.listen(0, '127.0.0.1');
    worker = await NestFactory.createApplicationContext(WorkerAppModule.register(config), {
      logger: false,
    });
    evaluator = worker.get(MissingHeartbeatEvaluatorService);
  });

  beforeEach(async () => {
    await queue.drain(true);
    await queue.clean(0, 10_000, 'completed');
    await queue.clean(0, 10_000, 'failed');
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "heartbeat_incidents", "heartbeat_states", "heartbeat_events", "telemetry_event_ids",
        "telemetry_batches", "ingest_keys", "environments", "projects", "sessions",
        "team_memberships", "teams", "users"
      CASCADE
    `);
    const authKeys = await redis.keys('blackbox:auth:*');
    if (authKeys.length > 0) {
      await redis.del(...authKeys);
    }
  });

  afterAll(async () => {
    await queue.drain(true);
    await queue.clean(0, 10_000, 'completed');
    await queue.clean(0, 10_000, 'failed');
    await api.close();
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
    redis.disconnect();
  });

  async function register(localPart: string): Promise<Identity> {
    const agent = request.agent(api.getHttpServer());
    const response = await agent
      .post('/v1/auth/register')
      .send({ email: emailFor(localPart), password, teamName: `${localPart} team` })
      .expect(201);
    return {
      agent,
      csrfToken: response.body.csrfToken,
      email: response.body.user.email,
      teamId: response.body.teams[0].id,
      userId: response.body.user.id,
    };
  }

  async function createIngestFixture(identity: Identity, name: string): Promise<IngestFixture> {
    const project = await identity.agent
      .post(`/v1/teams/${identity.teamId}/projects`)
      .set('X-CSRF-Token', identity.csrfToken)
      .send({ name: `${name} project` })
      .expect(201);
    const environment = await identity.agent
      .post(`/v1/teams/${identity.teamId}/projects/${project.body.id}/environments`)
      .set('X-CSRF-Token', identity.csrfToken)
      .send({ name: `${name} environment` })
      .expect(201);
    const key = await identity.agent
      .post(
        `/v1/teams/${identity.teamId}/projects/${project.body.id}/environments/${environment.body.id}/ingest-keys`,
      )
      .set('X-CSRF-Token', identity.csrfToken)
      .send({ name: `${name} key` })
      .expect(201);
    return {
      environmentId: environment.body.id,
      ingestKey: key.body.key,
      keyId: key.body.id,
      projectId: project.body.id,
    };
  }

  function heartbeatBatch(
    occurredAt = new Date().toISOString(),
    eventId = randomUUID(),
    batchId = randomUUID(),
  ) {
    return {
      batchId,
      events: [
        {
          eventId,
          expectedIntervalMs: 5_000,
          occurredAt,
          serviceName: 'checkout',
          serviceVersion: '1.0.0',
          type: 'heartbeat',
          uptimeMs: 12_345,
        },
      ],
      sentAt: new Date().toISOString(),
      version: 1,
    };
  }

  async function waitForCount(table: string, expected: number): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint AS "count" FROM "${table}"`,
      );
      if (Number(rows[0]?.count ?? 0) === expected) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${table} count ${expected}`);
  }

  async function waitForJobState(jobId: string, expected: string): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await queue.getJobState(jobId)) === expected) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for job ${jobId} state ${expected}`);
  }

  it('authenticates, validates, durably enqueues, and rejects revoked ingest keys', async () => {
    const owner = await register('ingestion');
    const fixture = await createIngestFixture(owner, 'ingestion');
    const batch = heartbeatBatch();

    await request(api.getHttpServer()).post('/v1/ingest/batches').send(batch).expect(401);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', 'invalid')
      .send(batch)
      .expect(401);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send({ ...batch, unexpected: true })
      .expect(400);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send({ ...batch, events: Array.from({ length: 101 }, () => batch.events[0]) })
      .expect(400);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send({ ...batch, padding: 'x'.repeat(102_400) })
      .expect(413);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send({
        ...batch,
        events: [{ ...batch.events[0], uptimeMs: Number.MAX_SAFE_INTEGER + 1 }],
      })
      .expect(400);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send(heartbeatBatch(new Date(Date.now() - 25 * 60 * 60 * 1_000).toISOString()))
      .expect(400);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send(heartbeatBatch(new Date(Date.now() + 6 * 60 * 1_000).toISOString()))
      .expect(400);

    const accepted = await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send(batch)
      .expect(202);
    expect(accepted.body).toEqual({ batchId: batch.batchId, status: 'queued' });
    expect(accepted.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(accepted.body)).not.toContain(fixture.ingestKey);
    await waitForCount('heartbeat_events', 1);

    await owner.agent
      .post(
        `/v1/teams/${owner.teamId}/projects/${fixture.projectId}/environments/${fixture.environmentId}/ingest-keys/${fixture.keyId}/revoke`,
      )
      .set('X-CSRF-Token', owner.csrfToken)
      .expect(200);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send(heartbeatBatch())
      .expect(401);
  });

  it('persists idempotently and serves scoped bounded deterministic queries', async () => {
    const ownerA = await register('query-a');
    const ownerB = await register('query-b');
    const fixture = await createIngestFixture(ownerA, 'query');
    const eventId = randomUUID();
    const first = heartbeatBatch(new Date(Date.now() - 2_000).toISOString(), eventId);

    await Promise.all([
      request(api.getHttpServer())
        .post('/v1/ingest/batches')
        .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
        .send(first)
        .expect(202),
      request(api.getHttpServer())
        .post('/v1/ingest/batches')
        .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
        .send(first)
        .expect(202),
    ]);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send(heartbeatBatch(new Date(Date.now() - 2_000).toISOString(), eventId))
      .expect(202);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send(heartbeatBatch(new Date(Date.now() - 1_000).toISOString()))
      .expect(202);
    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send(heartbeatBatch())
      .expect(202);
    await waitForCount('heartbeat_events', 3);

    const path = `/v1/teams/${ownerA.teamId}/projects/${fixture.projectId}/environments/${fixture.environmentId}/heartbeats`;
    await request(api.getHttpServer()).get(path).expect(401);
    const firstPage = await ownerA.agent.get(path).query({ limit: 2 }).expect(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.nextCursor).toBeTruthy();
    const secondPage = await ownerA.agent
      .get(path)
      .query({ cursor: firstPage.body.nextCursor, limit: 2 })
      .expect(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(
      new Set([...firstPage.body.items, ...secondPage.body.items].map(({ eventId: id }) => id))
        .size,
    ).toBe(3);

    await ownerA.agent
      .get(path)
      .query({
        from: new Date(Date.now() - 25 * 60 * 60 * 1_000).toISOString(),
        to: new Date().toISOString(),
      })
      .expect(400);
    await ownerA.agent.get(path).query({ cursor: 'not-a-valid-cursor' }).expect(400);
    await ownerB.agent
      .get(
        `/v1/teams/${ownerB.teamId}/projects/${fixture.projectId}/environments/${fixture.environmentId}/heartbeats`,
      )
      .expect(404);
  });

  it('rejects malformed jobs even when they are injected directly into Redis', async () => {
    const jobId = randomUUID();
    await queue.add(
      'heartbeat-batch',
      {
        batch: heartbeatBatch(),
        environmentId: randomUUID(),
        ingestKey: 'plaintext-must-not-be-accepted',
        ingestKeyId: randomUUID(),
      },
      { jobId },
    );

    await waitForJobState(jobId, 'failed');
    await waitForCount('heartbeat_events', 0);
    const failed = await queue.getJob(jobId);
    expect(failed?.failedReason).toBe('Invalid heartbeat job');
  });

  it('opens one inferred missing-heartbeat incident and resolves it on recovery', async () => {
    const owner = await register('incidents');
    const fixture = await createIngestFixture(owner, 'incidents');
    const oldHeartbeat = heartbeatBatch(new Date(Date.now() - 100_000).toISOString());

    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send(oldHeartbeat)
      .expect(202);
    await waitForCount('heartbeat_states', 1);

    await expect(evaluator.evaluate()).resolves.toBe(1);
    await expect(evaluator.evaluate()).resolves.toBe(0);
    const opened = await prisma.$queryRawUnsafe<
      Array<{ reason: string; status: string; summary: string }>
    >(`SELECT "reason", "status", "summary" FROM "heartbeat_incidents"`);
    expect(opened).toEqual([
      {
        reason: 'heartbeat_missing',
        status: 'open',
        summary: 'Heartbeat missing; downtime is inferred.',
      },
    ]);

    await request(api.getHttpServer())
      .post('/v1/ingest/batches')
      .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
      .send(heartbeatBatch())
      .expect(202);
    await waitForCount('heartbeat_events', 2);
    const resolved = await prisma.$queryRawUnsafe<
      Array<{ resolvedAt: Date | null; status: string }>
    >(`SELECT "resolved_at" AS "resolvedAt", "status" FROM "heartbeat_incidents"`);
    expect(resolved[0]?.status).toBe('resolved');
    expect(resolved[0]?.resolvedAt).toBeInstanceOf(Date);
  });

  it('keeps the example application running while its SDK reports heartbeats', async () => {
    const owner = await register('example');
    const fixture = await createIngestFixture(owner, 'example');
    const apiAddress = api.getHttpServer().address() as AddressInfo;
    const example = await NestFactory.create(
      ExampleAppModule.register({
        controlPlaneUrl: `http://127.0.0.1:${apiAddress.port}`,
        heartbeatIntervalMs: 5_000,
        ingestKey: fixture.ingestKey,
        requestTimeoutMs: 500,
        serviceName: 'blackbox-example',
      }),
      { logger: false },
    );
    await example.listen(0, '127.0.0.1');

    try {
      await request(example.getHttpServer()).get('/').expect(200);
      await waitForCount('heartbeat_events', 1);
      await request(example.getHttpServer()).get('/').expect(200);
    } finally {
      await example.close();
    }
  });

  it('fails closed when durable enqueue is unavailable', async () => {
    const owner = await register('redis-down');
    const fixture = await createIngestFixture(owner, 'redis-down');
    const unavailableApi = await NestFactory.create(
      ApiAppModule.register({ config: { ...config, redisUrl: 'redis://127.0.0.1:1' } }),
      { logger: false },
    );
    await unavailableApi.listen(0, '127.0.0.1');

    try {
      await request(unavailableApi.getHttpServer())
        .post('/v1/ingest/batches')
        .set('X-Blackbox-Ingest-Key', fixture.ingestKey)
        .send(heartbeatBatch())
        .expect(503);
    } finally {
      await unavailableApi.close();
    }
  });
});
