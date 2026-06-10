# Blackbox Project Definition

## Document Status

This document is the human-readable source of truth for Blackbox V1. It defines
the product boundary, architecture, security posture, and reliability guarantees.
Product implementation must not begin until Phase 1 in `INTEGRATION_PHASES.md` is
complete and the specific implementation phase is explicitly approved.

Changes to a decision listed under [Controlled Architecture Decisions](#controlled-architecture-decisions)
must be documented and approved before implementation.

## Purpose

Blackbox helps teams detect when their NestJS applications become unavailable,
consume excessive process resources, emit important errors, or produce log events
that match configured rules.

Users install the public Blackbox NestJS SDK in an application and operate a
self-hosted Blackbox control plane. The SDK reports telemetry to the control plane.
The control plane stores and queries telemetry, evaluates alert rules, opens and
resolves incidents, and sends notifications.

### Target Users

- NestJS developers who need a simple monitoring integration.
- Teams that require control over deployment and telemetry data.
- Operators who need application health alerts without adopting a full
  observability platform.

### Primary Use Cases

- Detect that an integrated application stopped reporting heartbeats.
- Detect sustained high process CPU, memory use, or event-loop delay.
- Capture uncaught exceptions, unhandled promise rejections, and structured logs.
- Alert on error rate or structured log matches.
- Review active and historical incidents by project and environment.
- Notify teams through email or signed webhooks.

## V1 Scope

V1 includes:

- A public `@blackbox/nestjs` npm package.
- A self-hosted control plane with separately deployable NestJS API and worker apps.
- Teams, role-based access, projects, environments, and revocable ingest keys.
- Heartbeats, process metrics, structured logs, and error telemetry.
- User-defined threshold and log-match rules.
- Incident creation, deduplication, acknowledgment, and automatic resolution.
- Email and signed webhook notifications.
- Versioned REST APIs with OpenAPI documentation.
- Configurable telemetry retention with a 30-day default.
- Docker Compose deployment for local development and initial self-hosting.

### Explicit Non-Goals

V1 does not include:

- Host-level monitoring or a standalone machine agent.
- Monitoring unrelated processes or applications without the SDK.
- Distributed tracing, request tracing, profiling, or anomaly detection.
- Automatic capture of request bodies, request headers, or environment variables.
- A hosted SaaS control plane, billing, or SaaS organization tenancy.
- A dashboard frontend. The backend will expose APIs needed by a future dashboard.
- Log-file tailing.
- Team invitations and invitation-based onboarding.
- Self-service password recovery or password reset.

## SDK-Only Monitoring Boundary

The SDK runs inside an integrated NestJS process. It can measure and report that
process, capture explicitly integrated NestJS logs, and report application errors.
It cannot directly observe the host's total CPU use, another process, a container
runtime, the network, or the control plane itself.

Downtime is inferred when the control plane does not receive expected heartbeats.
This can mean the monitored process stopped, the SDK stopped, the network failed,
or the control plane could not ingest telemetry. Incidents and documentation must
describe this as "heartbeat missing" rather than claiming a proven process crash.

## Glossary

| Term          | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| Control plane | The self-hosted Blackbox API, worker, PostgreSQL, and Redis deployment.     |
| SDK           | The `@blackbox/nestjs` package installed in a monitored NestJS application. |
| Team          | The access-control boundary containing users and projects.                  |
| Project       | A monitored application or logical service owned by one team.               |
| Environment   | A project deployment boundary such as production or staging.                |
| Ingest key    | A revocable secret that allows an SDK to send data for one environment.     |
| Telemetry     | Heartbeats, process metrics, structured logs, and errors sent by an SDK.    |
| Rule          | User-defined conditions that determine when an incident should open.        |
| Incident      | A durable record of a rule violation and its lifecycle.                     |
| Notification  | An email or webhook delivery produced by an incident transition.            |

## Architecture

### System Shape

Blackbox is a modular monolith with two separately deployable NestJS applications:

- **API:** Serves management APIs, telemetry ingestion, authentication, OpenAPI
  documentation, and telemetry queries.
- **Worker:** Persists queued telemetry, evaluates rules, detects missing
  heartbeats, delivers notifications, and performs retention jobs.

The applications share domain and application modules but have separate entry
points and scaling controls. This keeps V1 operationally understandable while
allowing ingestion and background work to scale independently.

```text
Integrated NestJS App
        |
        | batched HTTPS telemetry + ingest key
        v
Blackbox API ---- PostgreSQL control-plane queries
        |
        | durable BullMQ jobs
        v
Redis/BullMQ ---- Blackbox Worker ---- PostgreSQL telemetry/control data
                         |
                         +---- SMTP
                         +---- signed webhooks
```

### Planned Repository Structure

```text
blackbox/
├── apps/
│   ├── api/
│   ├── worker/
│   └── example-nest/
├── packages/
│   ├── server/
│   ├── sdk-nestjs/
│   ├── contracts/
│   ├── database/
│   ├── config/
│   └── testkit/
├── deploy/
├── docs/
├── AGENTS.md
└── README.md
```

`packages/server` owns backend modules. Each substantial module uses these
boundaries where useful:

```text
module/
├── domain/          # Entities, value objects, and domain rules
├── application/     # Use cases, ports, and orchestration
├── infrastructure/  # Prisma, SQL, BullMQ, SMTP, and webhook adapters
└── api/             # REST controllers and validated DTOs
```

Expected server modules are identity, teams, projects, telemetry, alerting,
incidents, and notifications. Modules may expose application interfaces and
shared contracts, but must not import another module's infrastructure internals.

### Infrastructure Responsibilities

- **PostgreSQL:** Source of truth for users, access control, configuration,
  telemetry, rules, incidents, notification attempts, and audit-relevant state.
- **Redis/BullMQ:** Durable asynchronous work, retries, delayed jobs, and
  scheduling. Redis is not a source of truth for user-visible state.
- **Prisma:** Schema and queries for control-plane relational data.
- **Explicit SQL:** Reviewed migrations, bulk inserts, partitions, indexes, and
  performance-sensitive telemetry queries that Prisma cannot model adequately.

Telemetry SQL must live behind typed repository interfaces. SQL migrations remain
part of the normal migration history and must work in clean and upgraded installs.

## Domain Model

### Access And Ownership

- A user authenticates locally with email and password.
- A team is the primary authorization and data-isolation boundary.
- A team membership has one role: `owner`, `admin`, `member`, or `viewer`.
- A project belongs to exactly one team.
- An environment belongs to exactly one project.
- An ingest key grants write-only telemetry access to exactly one environment.
- Ingest keys are displayed only when created and stored only as hashes.

All management and query operations must derive and enforce team scope on the
server. Client-provided team identifiers are never sufficient authorization.

### Rules And Incidents

Rules belong to an environment and define:

- Signal type: missing heartbeat, CPU, memory, event-loop delay, error rate, or
  structured log match.
- Condition and threshold or match criteria.
- Evaluation window or required violation duration.
- Cooldown and enabled state.

An incident belongs to one rule and environment. It transitions through:

```text
open -> acknowledged -> resolved
open -----------------> resolved
```

Repeated evaluations of the same active rule update the existing incident instead
of creating duplicates. Recovery automatically resolves eligible incidents.
Acknowledgment does not disable evaluation or prevent later resolution.

## Telemetry Lifecycle

### SDK Collection

The SDK provides `BlackboxModule.forRoot()` and `BlackboxModule.forRootAsync()`.
Configuration includes the control-plane endpoint, ingest key, environment,
service name, version, sampling interval, redaction keys, and buffer limits.

The SDK collects:

- Heartbeats and process uptime.
- Process CPU and memory use.
- Event-loop delay.
- Uncaught exceptions and unhandled promise rejections.
- Structured events sent through the documented NestJS logger integration.

The SDK does not automatically collect request bodies, headers, environment
variables, arbitrary object metadata, or log files. Explicitly supplied metadata
is filtered against allowlist and redaction configuration before it leaves the
application.

### Ingestion And Processing

1. The SDK assigns a stable event or batch identifier, batches telemetry, and
   sends it over HTTPS with an environment ingest key.
2. The API validates authentication, payload version, size, shape, and limits.
3. The API accepts a valid batch and creates an idempotent durable BullMQ job.
4. The worker bulk-persists telemetry and records processing completion.
5. Relevant jobs evaluate rules and update incidents.
6. Incident transitions enqueue retryable notification deliveries.

The ingestion endpoint is versioned under `/v1/ingest/batches`. Management and
query endpoints are also versioned under `/v1`. OpenAPI documents public REST
contracts. Shared TypeScript contracts may be generated or imported by the SDK,
but server internals must not leak into the public package.

### Queries

Telemetry queries require authenticated team access, explicit project and
environment scope, bounded time ranges, pagination, and deterministic ordering.
The API must reject unbounded or unsupported queries. Query response contracts are
versioned independently from internal storage representations.

### Storage And Retention

Control-plane records use normal relational tables managed through Prisma.
High-volume telemetry uses PostgreSQL time-based partitions, bulk inserts, and
purpose-specific indexes managed through reviewed SQL.

Detailed telemetry is retained for 30 days by default. The installation may
configure a different supported period. Retention jobs drop expired partitions
rather than deleting rows individually. Control-plane entities and incident
history are not removed by telemetry retention jobs.

## Security And Privacy

### Authentication And Authorization

- User passwords are hashed with Argon2id.
- Browser authentication uses secure, HTTP-only sessions with appropriate
  same-site and CSRF protections.
- Every control-plane action enforces team role permissions.
- SDK ingest keys cannot read telemetry or call management APIs.
- Revoked ingest keys stop authorizing new batches immediately.

### Conservative Collection

Privacy is enforced primarily in the SDK, before transmission. Collection is
allowlist-oriented. Sensitive fields configured for redaction must be removed or
replaced recursively before batching. The server performs defensive validation
and redaction but is not the primary privacy boundary.

Blackbox must never log plaintext passwords, ingest keys, session secrets,
webhook secrets, authorization headers, or raw notification credentials.

### Webhooks

Webhook payloads include an event identifier and timestamp and are signed with a
per-destination secret. Receivers can verify authenticity and reject replayed
deliveries. Secrets are shown once and stored encrypted or through a documented
external secret mechanism; they are never returned by normal APIs.

## Reliability Guarantees

### SDK Guarantees

- Monitoring is fail-open: collection or delivery failure never crashes or blocks
  the host application.
- Buffers are memory-bounded. When full, the SDK drops the oldest eligible
  telemetry and records a local dropped-count signal.
- Delivery uses bounded retries with backoff and jitter.
- Hooks and timers are cleaned up during graceful shutdown.
- SDK failures are reported through controlled diagnostics without recursive
  capture through its own logger integration.

Because the V1 SDK has no durable local spool, process termination can lose
buffered telemetry. This limitation must be documented in SDK user guidance.

### Server Guarantees

- Ingestion and workers are idempotent by stable batch/event identifiers.
- Duplicate delivery does not create duplicate telemetry, incidents, or
  notifications.
- API payload size, batch size, query range, concurrency, and queue growth are
  bounded by validated configuration.
- Jobs use bounded retries and dead-letter handling. Failed jobs remain
  inspectable and replayable by an operator.
- Notification attempts and outcomes are recorded.
- Health endpoints distinguish API liveness from dependency readiness.
- Missing-heartbeat evaluation tolerates expected delivery delay before opening
  an incident.

### Failure Modes And Recovery

| Failure                       | Required behavior                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Control plane unavailable     | SDK buffers within limits and retries; application continues normally.                   |
| Invalid or revoked ingest key | API rejects the batch; SDK reports controlled diagnostics without retry storms.          |
| Duplicate batch or job        | Idempotency returns or records the existing result.                                      |
| Redis unavailable             | API readiness fails; accepted-work behavior must avoid falsely claiming durable enqueue. |
| PostgreSQL unavailable        | Dependent readiness fails; jobs retry within limits and remain inspectable.              |
| Worker unavailable            | API may continue accepting durable jobs until configured queue limits are reached.       |
| Email/webhook failure         | Delivery retries with backoff, records attempts, then moves to dead-letter state.        |
| Retention job failure         | Existing data remains; failure is visible and the job can safely retry.                  |

Backup and restore guidance must cover PostgreSQL as the source of truth. Redis
durability settings and recovery expectations must be documented before a
production-ready release.

## Distribution And Operations

Blackbox source is distributed under Apache License 2.0. Stable SDK releases are
published to npm as `@blackbox/nestjs`; the repository remains the source of
truth. Releases use semantic versioning and document compatibility between SDK
and ingestion API versions.

The initial deployment includes API, worker, PostgreSQL, and Redis services.
Docker Compose supports local development and an understandable initial
self-hosting path. Production guidance must define TLS termination, secrets,
database backup, Redis durability, resource sizing, and upgrade procedures.

## Controlled Architecture Decisions

The owner must approve and document changes to any of these decisions before code
implements them:

- Product scope, V1 non-goals, or the SDK-only monitoring boundary.
- Self-hosted distribution or Apache 2.0 licensing.
- Modular monolith shape or the API/worker deployment boundary.
- PostgreSQL, Redis/BullMQ, Prisma, or explicit telemetry SQL responsibilities.
- Team/project/environment ownership and RBAC roles.
- REST/OpenAPI public interfaces or ingestion contract versioning.
- Conservative collection, credential storage, or security rules.
- Fail-open SDK behavior, idempotency, retry, retention, or incident semantics.
- Integration phase scope, order, approval gates, or exit criteria.

Approved changes must update this document and the decision/deviation log in
`INTEGRATION_PHASES.md` before implementation begins.
