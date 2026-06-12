# Blackbox

Blackbox is a self-hosted monitoring platform for NestJS applications. Applications
install the public Blackbox SDK to report heartbeats, process metrics, structured
logs, and errors to a Blackbox control plane. The control plane stores telemetry,
evaluates user-defined alert rules, tracks incidents, and delivers notifications.

Blackbox V1 monitors only NestJS applications that install and configure the SDK.
It does not monitor an entire host, unrelated processes, or applications that have
not integrated the SDK.

Phase 2 workspace foundation is complete. Phase 3 identity and project control
plane implementation is in progress and available for owner acceptance. Telemetry,
SDK collection, alerting, and notifications remain gated by later phases.

- [Project purpose and architecture](docs/PROJECT.md)
- [Integration phases and approval gates](docs/INTEGRATION_PHASES.md)
- [Compact instructions for coding agents](AGENTS.md)

## Local Foundation

Prerequisites:

- Node.js 22
- pnpm 10.12.4
- Docker with Docker Compose

```bash
corepack enable
corepack prepare pnpm@10.12.4 --activate
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:validate
pnpm dev:api
```

The API exposes:

- Liveness: `GET http://localhost:3000/v1/health/live`
- Dependency readiness: `GET http://localhost:3000/v1/health/ready`
- Authentication and session APIs under `http://localhost:3000/v1/auth`
- Team, membership, project, environment, and ingest-key management under
  `http://localhost:3000/v1/teams`
- OpenAPI UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/openapi.json`

Phase 3 browser sessions use an HTTP-only `SameSite=Strict` cookie. Authenticated
mutations also require the synchronizer token returned at registration or login in
the `X-CSRF-Token` header. Ingest keys are displayed once and cannot be recovered.

Run `pnpm dev:worker` and `pnpm dev:example` in separate terminals for the worker
foundation and example NestJS app.

## Quality Commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm test:integration
pnpm test:source-smoke
pnpm build
pnpm test:smoke
```

Set `RUN_DEPENDENCY_INTEGRATION=true` after starting local infrastructure to include
the real PostgreSQL and Redis readiness integration test. `pnpm test:source-smoke`
verifies startup without a prior build. `pnpm test:smoke` requires the built
workspace. Both smoke commands require running local infrastructure.
