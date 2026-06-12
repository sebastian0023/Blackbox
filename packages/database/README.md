# Database Package

Prisma will own ordinary control-plane relational schema and migrations. No domain
models are introduced during Phase 2.

High-volume telemetry migrations and performance-sensitive queries will use
reviewed SQL behind typed repository interfaces. Place future reviewed SQL
migrations in `sql/`, keep them reversible, and never edit an applied migration.
Prisma migration directories may include a reviewed `rollback.sql` companion for
operator-controlled reversal; Prisma deploy applies only `migration.sql`.

Useful commands:

- `pnpm db:validate` validates the Prisma schema.
- `pnpm db:generate` generates the Prisma client.
- `pnpm db:migrate` applies reviewed migrations to the configured database.
