# Database Package

Prisma will own ordinary control-plane relational schema and migrations. No domain
models are introduced during Phase 2.

High-volume telemetry migrations and performance-sensitive queries will use
reviewed SQL behind typed repository interfaces. Place future reviewed SQL
migrations in `sql/`, keep them reversible, and never edit an applied migration.

Useful commands:

- `pnpm db:validate` validates the Prisma schema.
- `pnpm db:generate` generates the Prisma client.
