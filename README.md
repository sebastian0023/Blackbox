# Blackbox

Blackbox is a self-hosted monitoring platform for NestJS applications. Applications
install the public Blackbox SDK to report heartbeats, process metrics, structured
logs, and errors to a Blackbox control plane. The control plane stores telemetry,
evaluates user-defined alert rules, tracks incidents, and delivers notifications.

Blackbox V1 monitors only NestJS applications that install and configure the SDK.
It does not monitor an entire host, unrelated processes, or applications that have
not integrated the SDK.

Phases 2 through 5 are complete. The Phase 6 logs-and-errors vertical slice is in
progress. User-configurable rules and notifications remain gated by later phases.

- [Project purpose and architecture](docs/PROJECT.md)
- [Integration phases and approval gates](docs/INTEGRATION_PHASES.md)
- [Phase 5 performance verification](docs/PHASE_5_PERFORMANCE.md)
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
- Authenticated telemetry ingestion:
  `POST http://localhost:3000/v1/ingest/batches`
- Team-scoped heartbeat, process-metric, log, and error queries under
  `http://localhost:3000/v1/teams`
- OpenAPI UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/openapi.json`

Phase 3 browser sessions use an HTTP-only `SameSite=Strict` cookie. Authenticated
mutations also require the synchronizer token returned at registration or login in
the `X-CSRF-Token` header. Ingest keys are displayed once and cannot be recovered.

Run `pnpm dev:worker` in a separate terminal. To run the example app with
heartbeats, create an ingest key and start it with:

```bash
BLACKBOX_CONTROL_PLANE_URL=http://127.0.0.1:3000 \
BLACKBOX_INGEST_KEY='<one-time-ingest-key>' \
pnpm dev:example
```

The SDK is fail-open and sends only the approved conservative contracts. It uses
one bounded memory buffer, timeouts, and retries; missing-heartbeat incidents
describe downtime as inferred rather than proven.

For explicit NestJS logger capture, inject `BlackboxRuntimeService`, wrap the
application's existing logger, and install the wrapper:

```ts
import { BlackboxLogger, BlackboxRuntimeService } from '@blackbox/nestjs';
import { ConsoleLogger } from '@nestjs/common';

const runtime = app.get(BlackboxRuntimeService);
app.useLogger(new BlackboxLogger(new ConsoleLogger(), runtime));
```

Only calls through that wrapper are captured. Configure `metadataAllowlist` for
permitted top-level metadata keys. Sensitive keys are recursively replaced with
`[REDACTED]`; the SDK never patches console or installs an
`unhandledRejection` listener.

## Quality Commands

```bash
pnpm format:check
pnpm audit --audit-level high
pnpm lint
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm test:integration
pnpm test:load:phase5
pnpm test:overhead:phase5
pnpm test:source-smoke
pnpm build
pnpm test:smoke
```

Set `RUN_DEPENDENCY_INTEGRATION=true` after starting local infrastructure to include
the real PostgreSQL and Redis readiness integration test. `pnpm test:source-smoke`
verifies startup without a prior build. `pnpm test:smoke` requires the built
workspace. Both smoke commands require running local infrastructure.
