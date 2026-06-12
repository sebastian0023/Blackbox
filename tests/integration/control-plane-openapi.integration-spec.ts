import type { ServerConfig } from '@blackbox/config';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiAppModule } from '../../apps/api/src/api-app.module';
import { buildOpenApiConfig } from '../../apps/api/src/openapi';

describe('Phase 3 and Phase 4 OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const config: ServerConfig = {
      apiHost: '127.0.0.1',
      apiPort: 3000,
      databaseUrl: 'postgresql://blackbox:blackbox@localhost:5432/blackbox',
      dependencyTimeoutMs: 200,
      nodeEnv: 'test',
      redisUrl: 'redis://localhost:6379',
    };
    app = await NestFactory.create(ApiAppModule.register({ config }), { logger: false });
    document = SwaggerModule.createDocument(app, buildOpenApiConfig());
    expect(document.components?.securitySchemes).toHaveProperty('session');
    expect(document.components?.securitySchemes).toHaveProperty('csrf');
    expect(document.components?.securitySchemes).toHaveProperty('ingestKey');
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents every Phase 3 public endpoint group', () => {
    expect(document.paths).toHaveProperty('/v1/auth/register');
    expect(document.paths).toHaveProperty('/v1/auth/login');
    expect(document.paths).toHaveProperty('/v1/auth/session');
    expect(document.paths).toHaveProperty('/v1/auth/logout');
    expect(document.paths).toHaveProperty('/v1/teams');
    expect(document.paths).toHaveProperty('/v1/teams/{teamId}');
    expect(document.paths).toHaveProperty('/v1/teams/{teamId}/members');
    expect(document.paths).toHaveProperty('/v1/teams/{teamId}/members/{userId}');
    expect(document.paths).toHaveProperty('/v1/teams/{teamId}/projects');
    expect(document.paths).toHaveProperty('/v1/teams/{teamId}/projects/{projectId}');
    expect(document.paths).toHaveProperty('/v1/teams/{teamId}/projects/{projectId}/environments');
    expect(document.paths).toHaveProperty(
      '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}',
    );
    expect(document.paths).toHaveProperty(
      '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}/ingest-keys',
    );
    expect(document.paths).toHaveProperty(
      '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}/ingest-keys/{keyId}/revoke',
    );
    expect(document.paths).toHaveProperty('/v1/ingest/batches');
    expect(document.paths).toHaveProperty(
      '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}/heartbeats',
    );
  });

  it('documents exact methods, response codes, schemas, and security requirements', () => {
    const session = [{ session: [] }];
    const sessionAndCsrf = [{ csrf: [], session: [] }];
    const operations = [
      { method: 'post', path: '/v1/auth/register', response: '201' },
      { method: 'post', path: '/v1/auth/login', response: '200' },
      { method: 'get', path: '/v1/auth/session', response: '200', security: session },
      { method: 'post', path: '/v1/auth/logout', response: '204', security: sessionAndCsrf },
      { method: 'get', path: '/v1/teams', response: '200', security: session },
      { method: 'patch', path: '/v1/teams/{teamId}', response: '200', security: sessionAndCsrf },
      { method: 'get', path: '/v1/teams/{teamId}/members', response: '200', security: session },
      {
        method: 'post',
        path: '/v1/teams/{teamId}/members',
        response: '201',
        security: sessionAndCsrf,
      },
      {
        method: 'patch',
        path: '/v1/teams/{teamId}/members/{userId}',
        response: '200',
        security: sessionAndCsrf,
      },
      {
        method: 'delete',
        path: '/v1/teams/{teamId}/members/{userId}',
        response: '204',
        security: sessionAndCsrf,
      },
      { method: 'get', path: '/v1/teams/{teamId}/projects', response: '200', security: session },
      {
        method: 'post',
        path: '/v1/teams/{teamId}/projects',
        response: '201',
        security: sessionAndCsrf,
      },
      {
        method: 'get',
        path: '/v1/teams/{teamId}/projects/{projectId}',
        response: '200',
        security: session,
      },
      {
        method: 'patch',
        path: '/v1/teams/{teamId}/projects/{projectId}',
        response: '200',
        security: sessionAndCsrf,
      },
      {
        method: 'delete',
        path: '/v1/teams/{teamId}/projects/{projectId}',
        response: '204',
        security: sessionAndCsrf,
      },
      {
        method: 'get',
        path: '/v1/teams/{teamId}/projects/{projectId}/environments',
        response: '200',
        security: session,
      },
      {
        method: 'post',
        path: '/v1/teams/{teamId}/projects/{projectId}/environments',
        response: '201',
        security: sessionAndCsrf,
      },
      {
        method: 'get',
        path: '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}',
        response: '200',
        security: session,
      },
      {
        method: 'patch',
        path: '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}',
        response: '200',
        security: sessionAndCsrf,
      },
      {
        method: 'delete',
        path: '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}',
        response: '204',
        security: sessionAndCsrf,
      },
      {
        method: 'get',
        path: '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}/ingest-keys',
        response: '200',
        security: session,
      },
      {
        method: 'post',
        path: '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}/ingest-keys',
        response: '201',
        security: sessionAndCsrf,
      },
      {
        method: 'post',
        path: '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}/ingest-keys/{keyId}/revoke',
        response: '200',
        security: sessionAndCsrf,
      },
      {
        method: 'post',
        path: '/v1/ingest/batches',
        response: '202',
        security: [{ ingestKey: [] }],
      },
      {
        method: 'get',
        path: '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}/heartbeats',
        response: '200',
        security: session,
      },
    ] as const;
    const bodylessPosts = new Set([
      '/v1/auth/logout',
      '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}/ingest-keys/{keyId}/revoke',
    ]);

    for (const expected of operations) {
      const path = document.paths[expected.path];
      expect(path).toBeDefined();
      const operation = path?.[expected.method];
      expect(operation).toBeDefined();
      expect(operation?.responses).toHaveProperty(expected.response);
      expect(operation?.security).toEqual('security' in expected ? expected.security : undefined);

      if (
        expected.method === 'patch' ||
        (expected.method === 'post' && !bodylessPosts.has(expected.path))
      ) {
        expect(operation?.requestBody).toBeDefined();
      }
    }

    const ingestion = document.paths['/v1/ingest/batches']?.post;
    for (const response of ['202', '400', '401', '413', '503']) {
      expect(ingestion?.responses).toHaveProperty(response);
    }
    expect(ingestion?.requestBody).toBeDefined();

    const heartbeatQuery =
      document.paths[
        '/v1/teams/{teamId}/projects/{projectId}/environments/{environmentId}/heartbeats'
      ]?.get;
    for (const response of ['200', '400', '401', '404']) {
      expect(heartbeatQuery?.responses).toHaveProperty(response);
    }
  });
});
