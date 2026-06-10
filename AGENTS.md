# Blackbox Agent Instructions

## Sources Of Truth

- Read `docs/INTEGRATION_PHASES.md` before changing the repository.
- Read the relevant sections of `docs/PROJECT.md` before designing or implementing.
- Work only on a phase whose status is `approved` or `in-progress`.
- Do not approve phases or change product decisions on the owner's behalf.
- If code and documentation disagree, stop implementation and record the conflict.

## Architecture Contract

- Blackbox is a self-hosted NestJS monitoring control plane plus public NestJS SDK.
- Keep the backend a modular monolith with separately deployable API and worker apps.
- Use PostgreSQL for persistence and Redis/BullMQ for asynchronous jobs.
- Use Prisma for control-plane data. Use reviewed SQL migrations and repository
  queries for partitioned telemetry and bulk ingestion.
- Public server APIs are versioned REST endpoints documented with OpenAPI.
- Preserve module ownership; communicate across modules through application
  interfaces, contracts, or jobs rather than importing module internals.

## Non-Negotiable Behavior

- The SDK is fail-open: monitoring must never crash or block the host application.
- Validate all external input at the boundary and version public contracts.
- Make telemetry ingestion and asynchronous processing idempotent.
- Default to conservative collection. Never collect request bodies, headers,
  environment variables, or arbitrary metadata unless explicitly allowlisted.
- Redact configured sensitive keys before data leaves the monitored application.
- Enforce team isolation and authorization on every control-plane operation.
- Never store plaintext passwords, ingest keys, session secrets, or webhook secrets.
- Bound queues, retries, SDK memory use, and telemetry retention.

## Engineering Rules

- Prefer existing repository patterns and keep changes inside the approved phase.
- Add dependencies only when the approved phase requires them; document why.
- Use validated configuration and fail fast when server configuration is invalid.
- Create reversible, reviewed migrations. Never edit an applied migration.
- Keep telemetry SQL isolated behind typed repository interfaces.
- Add focused unit tests and integration tests for behavior changed in the phase.
- Add end-to-end tests for cross-component flows and security boundaries.
- Do not mark a phase complete until every documented exit criterion passes.
- Update `docs/PROJECT.md` and the phase decision log before implementing an
  approved architectural deviation.
