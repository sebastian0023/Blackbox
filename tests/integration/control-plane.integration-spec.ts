import { PrismaClient, TeamRole } from '@blackbox/database';
import type { ServerConfig } from '@blackbox/config';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiAppModule } from '../../apps/api/src/api-app.module';

const runDependencyIntegration = process.env.RUN_DEPENDENCY_INTEGRATION === 'true';
const describeDependencies = runDependencyIntegration ? describe : describe.skip;
const password = 'CorrectHorseBattery!23';
const testRunId = randomUUID();

function emailFor(localPart: string): string {
  return `${localPart}+${testRunId}@example.com`;
}

interface RegisteredIdentity {
  readonly agent: ReturnType<typeof request.agent>;
  readonly csrfToken: string;
  readonly email: string;
  readonly sessionCookie: string;
  readonly teamId: string;
  readonly userId: string;
}

interface ResourceFixture {
  readonly environmentId: string;
  readonly ingestKey: string;
  readonly keyId: string;
  readonly projectId: string;
}

class CapturingLogger implements LoggerService {
  readonly entries: string[] = [];

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.capture(message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.capture(message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.capture(message, optionalParams);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.capture(message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.capture(message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.capture(message, optionalParams);
  }

  private capture(message: unknown, optionalParams: unknown[]): void {
    this.entries.push(JSON.stringify([message, ...optionalParams]));
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describeDependencies('Phase 3 identity and project control plane', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: Redis;

  const config: ServerConfig = {
    apiHost: '127.0.0.1',
    apiPort: 3000,
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgresql://blackbox:blackbox@localhost:5432/blackbox',
    dependencyTimeoutMs: 2000,
    nodeEnv: 'development',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  };

  async function cleanState(): Promise<void> {
    await prisma.ingestKey.deleteMany();
    await prisma.environment.deleteMany();
    await prisma.project.deleteMany();
    await prisma.session.deleteMany();
    await prisma.teamMembership.deleteMany();
    await prisma.team.deleteMany();
    await prisma.user.deleteMany();
    const rateLimitKeys = await redis.keys('blackbox:auth:*');
    if (rateLimitKeys.length > 0) {
      await redis.del(...rateLimitKeys);
    }
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
    redis = new Redis(config.redisUrl);
    app = await NestFactory.create(ApiAppModule.register({ config }), { logger: false });
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(cleanState);

  afterAll(async () => {
    await cleanState();
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
  });

  async function register(email: string, teamName: string): Promise<RegisteredIdentity> {
    const agent = request.agent(app.getHttpServer());
    const response = await agent
      .post('/v1/auth/register')
      .send({ email, password, teamName })
      .expect(201);
    const cookieHeader = response.headers['set-cookie'];
    const sessionCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;

    return {
      agent,
      csrfToken: response.body.csrfToken,
      email: response.body.user.email,
      sessionCookie: sessionCookie?.split(';')[0] ?? '',
      teamId: response.body.teams[0].id,
      userId: response.body.user.id,
    };
  }

  async function createResourceFixture(
    identity: RegisteredIdentity,
    namePrefix: string,
  ): Promise<ResourceFixture> {
    const project = await identity.agent
      .post(`/v1/teams/${identity.teamId}/projects`)
      .set('X-CSRF-Token', identity.csrfToken)
      .send({ name: `${namePrefix} project` })
      .expect(201);
    const environment = await identity.agent
      .post(`/v1/teams/${identity.teamId}/projects/${project.body.id}/environments`)
      .set('X-CSRF-Token', identity.csrfToken)
      .send({ name: `${namePrefix} environment` })
      .expect(201);
    const key = await identity.agent
      .post(
        `/v1/teams/${identity.teamId}/projects/${project.body.id}/environments/${environment.body.id}/ingest-keys`,
      )
      .set('X-CSRF-Token', identity.csrfToken)
      .send({ name: `${namePrefix} key` })
      .expect(201);
    expect(key.headers['cache-control']).toBe('no-store');

    return {
      environmentId: environment.body.id,
      ingestKey: key.body.key,
      keyId: key.body.id,
      projectId: project.body.id,
    };
  }

  it('hardens control-plane responses and never logs plaintext credentials', async () => {
    const logger = new CapturingLogger();
    const loggingApp = await NestFactory.create(ApiAppModule.register({ config }), { logger });
    await loggingApp.listen(0, '127.0.0.1');
    const agent = request.agent(loggingApp.getHttpServer());
    const loggingPassword = 'LoggingPassword!23';

    try {
      const registration = await agent
        .post('/v1/auth/register')
        .send({
          email: emailFor('logging'),
          password: loggingPassword,
          teamName: 'Logging team',
        })
        .expect(201);
      const cookieHeader = registration.headers['set-cookie'];
      const sessionCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
      const rawSessionToken = sessionCookie?.split(';')[0]?.split('=')[1];
      const identity: RegisteredIdentity = {
        agent,
        csrfToken: registration.body.csrfToken,
        email: registration.body.user.email,
        sessionCookie: sessionCookie?.split(';')[0] ?? '',
        teamId: registration.body.teams[0].id,
        userId: registration.body.user.id,
      };
      const fixture = await createResourceFixture(identity, 'logging');

      expect(registration.headers['cache-control']).toBe('no-store');
      expect(registration.headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(registration.headers['permissions-policy']).toBe(
        'camera=(), geolocation=(), microphone=()',
      );
      expect(registration.headers['referrer-policy']).toBe('no-referrer');
      expect(registration.headers['x-content-type-options']).toBe('nosniff');
      expect(registration.headers['x-frame-options']).toBe('DENY');
      expect(registration.headers).not.toHaveProperty('x-powered-by');

      const unauthorized = await request(loggingApp.getHttpServer()).get('/v1/teams').expect(401);
      expect(unauthorized.headers['cache-control']).toBe('no-store');
      expect(unauthorized.headers).not.toHaveProperty('x-powered-by');

      const captured = logger.entries.join('\n');
      expect(captured).not.toContain(loggingPassword);
      expect(captured).not.toContain(identity.csrfToken);
      expect(captured).not.toContain(fixture.ingestKey);
      expect(captured).not.toContain(rawSessionToken);
    } finally {
      await loggingApp.close();
    }
  });

  it('rejects unauthenticated access to every protected Phase 3 endpoint', async () => {
    const owner = await register(emailFor('unauthenticated-owner'), 'Protected team');
    const fixture = await createResourceFixture(owner, 'protected');
    const base = `/v1/teams/${owner.teamId}`;
    const project = `${base}/projects/${fixture.projectId}`;
    const environment = `${project}/environments/${fixture.environmentId}`;
    const key = `${environment}/ingest-keys/${fixture.keyId}`;
    const protectedEndpoints: ReadonlyArray<{
      readonly method: 'delete' | 'get' | 'patch' | 'post';
      readonly path: string;
    }> = [
      { method: 'get', path: '/v1/auth/session' },
      { method: 'post', path: '/v1/auth/logout' },
      { method: 'get', path: '/v1/teams' },
      { method: 'patch', path: base },
      { method: 'get', path: `${base}/members` },
      { method: 'post', path: `${base}/members` },
      { method: 'patch', path: `${base}/members/${owner.userId}` },
      { method: 'delete', path: `${base}/members/${owner.userId}` },
      { method: 'get', path: `${base}/projects` },
      { method: 'post', path: `${base}/projects` },
      { method: 'get', path: project },
      { method: 'patch', path: project },
      { method: 'delete', path: project },
      { method: 'get', path: `${project}/environments` },
      { method: 'post', path: `${project}/environments` },
      { method: 'get', path: environment },
      { method: 'patch', path: environment },
      { method: 'delete', path: environment },
      { method: 'get', path: `${environment}/ingest-keys` },
      { method: 'post', path: `${environment}/ingest-keys` },
      { method: 'post', path: `${key}/revoke` },
    ];

    for (const endpoint of protectedEndpoints) {
      const unauthenticatedRequest = request(app.getHttpServer());
      const call = unauthenticatedRequest[endpoint.method](endpoint.path);
      await call.send({ email: owner.email, name: 'Denied', role: TeamRole.owner }).expect(401);
    }
  });

  it('binds CSRF tokens to one live session and rejects malformed or replayed credentials', async () => {
    const first = await register(emailFor('csrf-first'), 'CSRF first');
    const second = await register(emailFor('csrf-second'), 'CSRF second');

    await first.agent
      .patch(`/v1/teams/${first.teamId}`)
      .set('X-CSRF-Token', second.csrfToken)
      .send({ name: 'Cross-session denied' })
      .expect(403);
    await first.agent
      .patch(`/v1/teams/${first.teamId}`)
      .set('X-CSRF-Token', `${first.csrfToken}, ${first.csrfToken}`)
      .send({ name: 'Duplicated denied' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/v1/auth/session')
      .set('Cookie', 'blackbox_session=%ZZ')
      .expect(401);

    await first.agent.post('/v1/auth/logout').set('X-CSRF-Token', first.csrfToken).expect(204);
    await request(app.getHttpServer())
      .patch(`/v1/teams/${first.teamId}`)
      .set('Cookie', first.sessionCookie)
      .set('X-CSRF-Token', first.csrfToken)
      .send({ name: 'Replay denied' })
      .expect(401);
  });

  it('protects password and session secrets, validates CSRF, and revokes logout', async () => {
    const agent = request.agent(app.getHttpServer());
    const normalizedEmail = emailFor('owner');
    const registration = await agent
      .post('/v1/auth/register')
      .send({
        email: normalizedEmail.toUpperCase(),
        password,
        teamName: 'Initial team',
      })
      .expect(201);
    const csrfToken: string = registration.body.csrfToken;
    const teamId: string = registration.body.teams[0].id;
    const cookieHeader = registration.headers['set-cookie'];
    const sessionCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    const rawSessionToken = sessionCookie?.split(';')[0]?.split('=')[1];

    expect(registration.body.user.email).toBe(normalizedEmail);
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Strict');
    expect(rawSessionToken).toBeTruthy();

    const persistedUser = await prisma.user.findUniqueOrThrow({
      where: { email: normalizedEmail },
    });
    const persistedSession = await prisma.session.findFirstOrThrow({
      where: { userId: persistedUser.id },
    });

    expect(persistedUser.passwordHash).toMatch(/^\$argon2id\$/);
    expect(persistedUser.passwordHash).not.toContain(password);
    expect(persistedSession.tokenHash).not.toBe(rawSessionToken);
    expect(JSON.stringify(persistedSession)).not.toContain(rawSessionToken);
    expect(JSON.stringify(persistedSession)).not.toContain(csrfToken);

    await agent.get('/v1/auth/session').expect(200);
    await agent.patch(`/v1/teams/${teamId}`).send({ name: 'Denied rename' }).expect(403);
    await agent
      .patch(`/v1/teams/${teamId}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Renamed team' })
      .expect(200);
    await agent
      .patch(`/v1/teams/${teamId}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Valid', unexpected: true })
      .expect(400);
    await agent.post('/v1/auth/logout').set('X-CSRF-Token', csrfToken).expect(204);
    await agent.get('/v1/auth/session').expect(401);

    const invalidCredentials = {
      error: 'Unauthorized',
      message: 'Invalid email or password',
      statusCode: 401,
    };
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: normalizedEmail, password: 'DefinitelyWrong!23' })
      .expect(401, invalidCredentials);
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: emailFor('unknown'), password: 'DefinitelyWrong!23' })
      .expect(401, invalidCredentials);

    await agent.post('/v1/auth/login').send({ email: normalizedEmail, password }).expect(200);
    const activeSession = await prisma.session.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { userId: persistedUser.id },
    });
    await prisma.session.update({
      data: { expiresAt: new Date(0) },
      where: { id: activeSession.id },
    });
    await agent.get('/v1/auth/session').expect(401);
  });

  it('bounds failed authentication attempts and active sessions', async () => {
    const identity = await register(emailFor('bounded'), 'Bounded team');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: identity.email, password: 'DefinitelyWrong!23' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: identity.email, password })
      .expect(429);

    const sessionIdentity = await register(emailFor('sessions'), 'Sessions team');
    for (let login = 0; login < 10; login += 1) {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: sessionIdentity.email, password })
        .expect(200);
    }

    await expect(prisma.session.count({ where: { userId: sessionIdentity.userId } })).resolves.toBe(
      10,
    );
  });

  it('applies normalized atomic rate limits and ignores spoofed forwarding headers', async () => {
    const identity = await register(emailFor('atomic-rate-limit'), 'Atomic rate limit');
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        request(app.getHttpServer())
          .post('/v1/auth/login')
          .set('X-Forwarded-For', `203.0.113.${index + 1}`)
          .send({
            email: index % 2 === 0 ? identity.email.toUpperCase() : identity.email,
            password: 'DefinitelyWrong!23',
          }),
      ),
    );

    expect(attempts.filter(({ status }) => status === 401)).toHaveLength(5);
    expect(attempts.filter(({ status }) => status === 429)).toHaveLength(5);

    const rateLimitKeys = await redis.keys('blackbox:auth:*');
    if (rateLimitKeys.length > 0) {
      await redis.del(...rateLimitKeys);
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .set('X-Forwarded-For', `198.51.100.${attempt + 1}`)
        .send({
          email: emailFor(`spoofed-registration-${attempt}`),
          password,
          teamName: `Spoofed registration ${attempt}`,
        })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .set('X-Forwarded-For', '198.51.100.250')
      .send({
        email: emailFor('spoof-blocked'),
        password,
        teamName: 'Spoofed registration blocked',
      })
      .expect(429);
  });

  it('bounds registration before Argon2id work can exhaust the API', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: emailFor(`registration-${attempt}`),
          password,
          teamName: `Registration ${attempt}`,
        })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: emailFor('registration-blocked'),
        password,
        teamName: 'Registration blocked',
      })
      .expect(429);
  });

  it('fails authentication closed when Redis rate-limit protection is unavailable', async () => {
    const unavailableApp = await NestFactory.create(
      ApiAppModule.register({
        config: {
          ...config,
          dependencyTimeoutMs: 200,
          redisUrl: 'redis://127.0.0.1:1',
        },
      }),
      { logger: false },
    );
    await unavailableApp.listen(0, '127.0.0.1');

    try {
      await request(unavailableApp.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: emailFor('redis-unavailable'), password })
        .expect(503);
    } finally {
      await unavailableApp.close();
    }
  });

  it('marks production session cookies secure', async () => {
    const productionApp = await NestFactory.create(
      ApiAppModule.register({ config: { ...config, nodeEnv: 'production' } }),
      { logger: false },
    );
    await productionApp.listen(0, '127.0.0.1');

    try {
      const response = await request(productionApp.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: emailFor('production-cookie'),
          password,
          teamName: 'Production cookie',
        })
        .expect(201);
      const cookieHeader = response.headers['set-cookie'];
      const sessionCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;

      expect(sessionCookie).toContain('Secure');
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Strict');
    } finally {
      await productionApp.close();
    }
  });

  it('enforces the complete endpoint permission matrix for every team role', async () => {
    const owner = await register(emailFor('matrix-owner'), 'Permission matrix');
    const admin = await register(emailFor('matrix-admin'), 'Admin home');
    const member = await register(emailFor('matrix-member'), 'Member home');
    const viewer = await register(emailFor('matrix-viewer'), 'Viewer home');

    for (const entry of [
      { identity: admin, role: TeamRole.admin },
      { identity: member, role: TeamRole.member },
      { identity: viewer, role: TeamRole.viewer },
    ]) {
      await owner.agent
        .post(`/v1/teams/${owner.teamId}/members`)
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ email: entry.identity.email, role: entry.role })
        .expect(201);
    }

    const fixture = await createResourceFixture(owner, 'matrix');
    const projectPath = `/v1/teams/${owner.teamId}/projects/${fixture.projectId}`;
    const environmentPath = `${projectPath}/environments/${fixture.environmentId}`;
    const keyPath = `${environmentPath}/ingest-keys`;
    const roles = [
      { canDelete: true, canManageKeys: true, canWrite: true, identity: owner, name: 'owner' },
      { canDelete: true, canManageKeys: true, canWrite: true, identity: admin, name: 'admin' },
      { canDelete: false, canManageKeys: false, canWrite: true, identity: member, name: 'member' },
      { canDelete: false, canManageKeys: false, canWrite: false, identity: viewer, name: 'viewer' },
    ] as const;

    for (const role of roles) {
      await role.identity.agent.get(`/v1/teams/${owner.teamId}/members`).expect(200);
      await role.identity.agent.get(`/v1/teams/${owner.teamId}/projects`).expect(200);
      await role.identity.agent.get(projectPath).expect(200);
      await role.identity.agent.get(`${projectPath}/environments`).expect(200);
      await role.identity.agent.get(environmentPath).expect(200);
      await role.identity.agent.get(keyPath).expect(role.canManageKeys ? 200 : 403);

      await role.identity.agent
        .patch(`/v1/teams/${owner.teamId}`)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .send({ name: `Permission matrix ${role.name}` })
        .expect(role.canDelete ? 200 : 403);
      await role.identity.agent
        .post(`/v1/teams/${owner.teamId}/projects`)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .send({ name: `${role.name} project` })
        .expect(role.canWrite ? 201 : 403);
      await role.identity.agent
        .patch(projectPath)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .send({ name: `matrix project ${role.name}` })
        .expect(role.canWrite ? 200 : 403);
      await role.identity.agent
        .post(`${projectPath}/environments`)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .send({ name: `${role.name} environment` })
        .expect(role.canWrite ? 201 : 403);
      await role.identity.agent
        .patch(environmentPath)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .send({ name: `matrix environment ${role.name}` })
        .expect(role.canWrite ? 200 : 403);
      await role.identity.agent
        .post(keyPath)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .send({ name: `${role.name} key` })
        .expect(role.canManageKeys ? 201 : 403);
    }

    for (const role of roles) {
      const disposable = await createResourceFixture(owner, `delete by ${role.name}`);
      const disposableProjectPath = `/v1/teams/${owner.teamId}/projects/${disposable.projectId}`;
      const disposableEnvironmentPath = `${disposableProjectPath}/environments/${disposable.environmentId}`;

      await role.identity.agent
        .delete(disposableEnvironmentPath)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .expect(role.canDelete ? 204 : 403);
      if (!role.canDelete) {
        await owner.agent
          .delete(disposableEnvironmentPath)
          .set('X-CSRF-Token', owner.csrfToken)
          .expect(204);
      }
      await role.identity.agent
        .delete(disposableProjectPath)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .expect(role.canDelete ? 204 : 403);
      if (!role.canDelete) {
        await owner.agent
          .delete(disposableProjectPath)
          .set('X-CSRF-Token', owner.csrfToken)
          .expect(204);
      }
    }

    const target = await register(emailFor('matrix-target'), 'Target home');
    for (const role of roles.slice(1)) {
      await role.identity.agent
        .post(`/v1/teams/${owner.teamId}/members`)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .send({ email: target.email, role: TeamRole.viewer })
        .expect(403);
    }
    await owner.agent
      .post(`/v1/teams/${owner.teamId}/members`)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ email: target.email, role: TeamRole.viewer })
      .expect(201);
    for (const role of roles.slice(1)) {
      await role.identity.agent
        .patch(`/v1/teams/${owner.teamId}/members/${target.userId}`)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .send({ role: TeamRole.member })
        .expect(403);
      await role.identity.agent
        .delete(`/v1/teams/${owner.teamId}/members/${target.userId}`)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .expect(403);
    }
    await owner.agent
      .patch(`/v1/teams/${owner.teamId}/members/${target.userId}`)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ role: TeamRole.member })
      .expect(200);
    await owner.agent
      .delete(`/v1/teams/${owner.teamId}/members/${target.userId}`)
      .set('X-CSRF-Token', owner.csrfToken)
      .expect(204);

    for (const role of roles) {
      const key = await owner.agent
        .post(keyPath)
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ name: `revoke by ${role.name}` })
        .expect(201);
      await role.identity.agent
        .post(`${keyPath}/${key.body.id}/revoke`)
        .set('X-CSRF-Token', role.identity.csrfToken)
        .expect(role.canManageKeys ? 200 : 403);
    }
  });

  it('enforces role permissions and prevents cross-team identifier substitution', async () => {
    const ownerA = await register(emailFor('owner-a'), 'Team A');
    const ownerB = await register(emailFor('owner-b'), 'Team B');
    const project = await ownerA.agent
      .post(`/v1/teams/${ownerA.teamId}/projects`)
      .set('X-CSRF-Token', ownerA.csrfToken)
      .send({ name: 'Private project' })
      .expect(201);
    const environment = await ownerA.agent
      .post(`/v1/teams/${ownerA.teamId}/projects/${project.body.id}/environments`)
      .set('X-CSRF-Token', ownerA.csrfToken)
      .send({ name: 'private' })
      .expect(201);
    const keyPath = `/v1/teams/${ownerA.teamId}/projects/${project.body.id}/environments/${environment.body.id}/ingest-keys`;
    const privateKey = await ownerA.agent
      .post(keyPath)
      .set('X-CSRF-Token', ownerA.csrfToken)
      .send({ name: 'private key' })
      .expect(201);

    await ownerB.agent.get(`/v1/teams/${ownerA.teamId}/members`).expect(404);
    await ownerB.agent.get(`/v1/teams/${ownerA.teamId}/projects`).expect(404);
    await ownerB.agent.get(`/v1/teams/${ownerA.teamId}/projects/${project.body.id}`).expect(404);
    await ownerB.agent.get(`/v1/teams/${ownerB.teamId}/projects/${project.body.id}`).expect(404);
    await ownerB.agent
      .get(
        `/v1/teams/${ownerB.teamId}/projects/${project.body.id}/environments/${environment.body.id}`,
      )
      .expect(404);
    await ownerB.agent.get(keyPath).expect(404);
    await ownerB.agent
      .post(`/v1/teams/${ownerA.teamId}/projects`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ name: 'Substitution project' })
      .expect(404);
    await ownerB.agent
      .patch(`/v1/teams/${ownerA.teamId}`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ name: 'Substitution team' })
      .expect(404);
    await ownerB.agent
      .post(`/v1/teams/${ownerA.teamId}/members`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ email: ownerB.email, role: TeamRole.owner })
      .expect(404);
    await ownerB.agent
      .patch(`/v1/teams/${ownerA.teamId}/members/${ownerA.userId}`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ role: TeamRole.viewer })
      .expect(404);
    await ownerB.agent
      .delete(`/v1/teams/${ownerA.teamId}/members/${ownerA.userId}`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .expect(404);
    await ownerB.agent
      .patch(`/v1/teams/${ownerA.teamId}/projects/${project.body.id}`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ name: 'Substitution project' })
      .expect(404);
    await ownerB.agent
      .delete(`/v1/teams/${ownerA.teamId}/projects/${project.body.id}`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .expect(404);
    await ownerB.agent
      .post(`/v1/teams/${ownerA.teamId}/projects/${project.body.id}/environments`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ name: 'substitution' })
      .expect(404);
    await ownerB.agent
      .patch(
        `/v1/teams/${ownerA.teamId}/projects/${project.body.id}/environments/${environment.body.id}`,
      )
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ name: 'substitution' })
      .expect(404);
    await ownerB.agent
      .delete(
        `/v1/teams/${ownerA.teamId}/projects/${project.body.id}/environments/${environment.body.id}`,
      )
      .set('X-CSRF-Token', ownerB.csrfToken)
      .expect(404);
    await ownerB.agent
      .post(keyPath)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ name: 'substitution key' })
      .expect(404);
    await ownerB.agent
      .post(`${keyPath}/${privateKey.body.id}/revoke`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .expect(404);

    await ownerA.agent
      .post(`/v1/teams/${ownerA.teamId}/members`)
      .set('X-CSRF-Token', ownerA.csrfToken)
      .send({ email: ownerB.email, role: TeamRole.viewer })
      .expect(201);
    await ownerB.agent.get(`/v1/teams/${ownerA.teamId}/projects`).expect(200);
    await ownerB.agent.get(keyPath).expect(403);
    await ownerB.agent
      .post(`/v1/teams/${ownerA.teamId}/projects`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ name: 'Viewer project' })
      .expect(403);

    await ownerA.agent
      .patch(`/v1/teams/${ownerA.teamId}/members/${ownerB.userId}`)
      .set('X-CSRF-Token', ownerA.csrfToken)
      .send({ role: TeamRole.member })
      .expect(200);
    const memberProject = await ownerB.agent
      .post(`/v1/teams/${ownerA.teamId}/projects`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ name: 'Member project' })
      .expect(201);
    await ownerB.agent
      .post(keyPath)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ name: 'member key' })
      .expect(403);
    await ownerB.agent
      .delete(`/v1/teams/${ownerA.teamId}/projects/${memberProject.body.id}`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .expect(403);

    await ownerA.agent
      .patch(`/v1/teams/${ownerA.teamId}/members/${ownerB.userId}`)
      .set('X-CSRF-Token', ownerA.csrfToken)
      .send({ role: TeamRole.admin })
      .expect(200);
    await ownerB.agent
      .post(`/v1/teams/${ownerA.teamId}/members`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .send({ email: ownerA.email, role: TeamRole.viewer })
      .expect(403);
    await ownerB.agent
      .delete(`/v1/teams/${ownerA.teamId}/projects/${memberProject.body.id}`)
      .set('X-CSRF-Token', ownerB.csrfToken)
      .expect(204);

    await ownerA.agent
      .delete(`/v1/teams/${ownerA.teamId}/members/${ownerA.userId}`)
      .set('X-CSRF-Token', ownerA.csrfToken)
      .expect(409);
  });

  it('shows ingest keys once, stores only a hash, and revokes idempotently', async () => {
    const owner = await register(emailFor('keys'), 'Keys team');
    const project = await owner.agent
      .post(`/v1/teams/${owner.teamId}/projects`)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ name: 'API' })
      .expect(201);
    const environment = await owner.agent
      .post(`/v1/teams/${owner.teamId}/projects/${project.body.id}/environments`)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ name: 'production' })
      .expect(201);
    const path = `/v1/teams/${owner.teamId}/projects/${project.body.id}/environments/${environment.body.id}/ingest-keys`;
    const created = await owner.agent
      .post(path)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ name: 'primary' })
      .expect(201);
    const plaintextKey: string = created.body.key;
    const persisted = await prisma.ingestKey.findUniqueOrThrow({ where: { id: created.body.id } });

    expect(plaintextKey).toMatch(/^bbx_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+$/);
    expect(persisted.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain(plaintextKey);

    const listed = await owner.agent.get(path).expect(200);
    expect(listed.body[0]).not.toHaveProperty('key');
    expect(listed.body[0]).not.toHaveProperty('secretHash');

    const revoked = await owner.agent
      .post(`${path}/${created.body.id}/revoke`)
      .set('X-CSRF-Token', owner.csrfToken)
      .expect(200);
    const revokedAgain = await owner.agent
      .post(`${path}/${created.body.id}/revoke`)
      .set('X-CSRF-Token', owner.csrfToken)
      .expect(200);

    expect(revoked.body.revokedAt).toBeTruthy();
    expect(revokedAgain.body.revokedAt).toBe(revoked.body.revokedAt);
  });

  it('rejects malformed input, oversized bodies, and invalid persisted credential formats', async () => {
    const owner = await register(emailFor('validation'), 'Validation team');
    const fixture = await createResourceFixture(owner, 'validation');

    await owner.agent.get('/v1/teams/not-a-uuid/projects').expect(400);
    await owner.agent
      .post(`/v1/teams/${owner.teamId}/members`)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ email: owner.email, role: 'super-admin' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: emailFor('short-password'), password: 'too-short', teamName: 'Short' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: emailFor('long-password'), password: 'x'.repeat(257), teamName: 'Long' })
      .expect(400);
    await owner.agent
      .post(`/v1/teams/${owner.teamId}/projects`)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ name: 'x'.repeat(110_000) })
      .expect(413);

    const injectionName = `雪'); DROP TABLE projects; --`;
    const injectionProject = await owner.agent
      .post(`/v1/teams/${owner.teamId}/projects`)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ name: injectionName })
      .expect(201);
    expect(injectionProject.body.name).toBe(injectionName);

    await expect(
      prisma.user.create({
        data: { email: emailFor('invalid-password-hash'), passwordHash: 'plaintext-password' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.session.create({
        data: {
          csrfTokenHash: '0'.repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
          tokenHash: 'not-a-valid-sha256-hash'.padEnd(64, 'x'),
          userId: owner.userId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.ingestKey.create({
        data: {
          environmentId: fixture.environmentId,
          name: 'invalid hash',
          prefix: `bbx_invalid_${randomUUID().slice(0, 8)}`,
          secretHash: 'not-a-valid-sha256-hash'.padEnd(64, 'x'),
        },
      }),
    ).rejects.toThrow();
  });

  it('preserves security invariants during concurrent mutations', async () => {
    const ownerA = await register(emailFor('concurrent-owner-a'), 'Concurrent team');
    const ownerB = await register(emailFor('concurrent-owner-b'), 'Other team');

    const duplicateProjects = await Promise.all([
      ownerA.agent
        .post(`/v1/teams/${ownerA.teamId}/projects`)
        .set('X-CSRF-Token', ownerA.csrfToken)
        .send({ name: 'Concurrent duplicate' }),
      ownerA.agent
        .post(`/v1/teams/${ownerA.teamId}/projects`)
        .set('X-CSRF-Token', ownerA.csrfToken)
        .send({ name: 'Concurrent duplicate' }),
    ]);
    expect(duplicateProjects.map(({ status }) => status).sort()).toEqual([201, 409]);
    await expect(
      prisma.project.count({ where: { name: 'Concurrent duplicate', teamId: ownerA.teamId } }),
    ).resolves.toBe(1);

    const fixture = await createResourceFixture(ownerA, 'concurrent revoke');
    const keyPath = `/v1/teams/${ownerA.teamId}/projects/${fixture.projectId}/environments/${fixture.environmentId}/ingest-keys/${fixture.keyId}/revoke`;
    const revocations = await Promise.all([
      ownerA.agent.post(keyPath).set('X-CSRF-Token', ownerA.csrfToken),
      ownerA.agent.post(keyPath).set('X-CSRF-Token', ownerA.csrfToken),
    ]);
    expect(revocations.every(({ status }) => status === 200)).toBe(true);
    expect(revocations[0].body.revokedAt).toBe(revocations[1].body.revokedAt);

    await ownerA.agent
      .post(`/v1/teams/${ownerA.teamId}/members`)
      .set('X-CSRF-Token', ownerA.csrfToken)
      .send({ email: ownerB.email, role: TeamRole.owner })
      .expect(201);
    const ownerChanges = await Promise.all([
      ownerA.agent
        .patch(`/v1/teams/${ownerA.teamId}/members/${ownerB.userId}`)
        .set('X-CSRF-Token', ownerA.csrfToken)
        .send({ role: TeamRole.member }),
      ownerB.agent
        .patch(`/v1/teams/${ownerA.teamId}/members/${ownerA.userId}`)
        .set('X-CSRF-Token', ownerB.csrfToken)
        .send({ role: TeamRole.member }),
    ]);
    expect(ownerChanges.filter(({ status }) => status === 200)).toHaveLength(1);
    await expect(
      prisma.teamMembership.count({ where: { role: TeamRole.owner, teamId: ownerA.teamId } }),
    ).resolves.toBe(1);

    await prisma.session.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        csrfTokenHash: sha256(`csrf-${testRunId}-${index}`),
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: sha256(`session-${testRunId}-${index}`),
        userId: ownerA.userId,
      })),
    });
    const concurrentLogins = await Promise.all([
      request(app.getHttpServer()).post('/v1/auth/login').send({ email: ownerA.email, password }),
      request(app.getHttpServer()).post('/v1/auth/login').send({ email: ownerA.email, password }),
    ]);
    expect(concurrentLogins.every(({ status }) => status === 200)).toBe(true);
    await expect(prisma.session.count({ where: { userId: ownerA.userId } })).resolves.toBe(10);
  });
});
