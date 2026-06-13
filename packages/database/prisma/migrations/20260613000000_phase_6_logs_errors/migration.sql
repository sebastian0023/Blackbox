ALTER TABLE "telemetry_event_ids"
    DROP CONSTRAINT "telemetry_event_ids_type_valid";

ALTER TABLE "telemetry_event_ids"
    ADD CONSTRAINT "telemetry_event_ids_type_valid"
        CHECK ("event_type" IN ('heartbeat', 'process_metric', 'log', 'error'));

CREATE TABLE "log_events" (
    "event_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" VARCHAR(16) NOT NULL,
    "message" VARCHAR(2048) NOT NULL,
    "context" VARCHAR(100),
    "metadata" JSONB,
    "service_name" VARCHAR(100) NOT NULL,
    "service_version" VARCHAR(100),
    CONSTRAINT "log_events_level_valid"
        CHECK ("level" IN ('debug', 'error', 'fatal', 'log', 'verbose', 'warn')),
    CONSTRAINT "log_events_batch_id_fkey"
        FOREIGN KEY ("batch_id") REFERENCES "telemetry_batches"("batch_id") ON DELETE CASCADE,
    CONSTRAINT "log_events_environment_id_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE
) PARTITION BY RANGE ("occurred_at");

CREATE TABLE "log_events_2026_06" PARTITION OF "log_events"
    FOR VALUES FROM ('2026-06-01T00:00:00Z') TO ('2026-07-01T00:00:00Z');
CREATE TABLE "log_events_2026_07" PARTITION OF "log_events"
    FOR VALUES FROM ('2026-07-01T00:00:00Z') TO ('2026-08-01T00:00:00Z');
CREATE TABLE "log_events_default" PARTITION OF "log_events" DEFAULT;
CREATE UNIQUE INDEX "log_events_event_id_occurred_at_key"
    ON "log_events"("event_id", "occurred_at");
CREATE INDEX "log_events_environment_occurred_event_idx"
    ON "log_events"("environment_id", "occurred_at" DESC, "event_id" DESC);
CREATE INDEX "log_events_environment_level_occurred_idx"
    ON "log_events"("environment_id", "level", "occurred_at" DESC);
CREATE INDEX "log_events_occurred_at_brin_idx" ON "log_events" USING BRIN ("occurred_at");

CREATE TABLE "error_events" (
    "event_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(2048) NOT NULL,
    "message" VARCHAR(2048) NOT NULL,
    "stack" VARCHAR(16384),
    "source" VARCHAR(32) NOT NULL,
    "metadata" JSONB,
    "service_name" VARCHAR(100) NOT NULL,
    "service_version" VARCHAR(100),
    CONSTRAINT "error_events_source_valid"
        CHECK ("source" IN ('uncaught_exception', 'unhandled_rejection')),
    CONSTRAINT "error_events_batch_id_fkey"
        FOREIGN KEY ("batch_id") REFERENCES "telemetry_batches"("batch_id") ON DELETE CASCADE,
    CONSTRAINT "error_events_environment_id_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE
) PARTITION BY RANGE ("occurred_at");

CREATE TABLE "error_events_2026_06" PARTITION OF "error_events"
    FOR VALUES FROM ('2026-06-01T00:00:00Z') TO ('2026-07-01T00:00:00Z');
CREATE TABLE "error_events_2026_07" PARTITION OF "error_events"
    FOR VALUES FROM ('2026-07-01T00:00:00Z') TO ('2026-08-01T00:00:00Z');
CREATE TABLE "error_events_default" PARTITION OF "error_events" DEFAULT;
CREATE UNIQUE INDEX "error_events_event_id_occurred_at_key"
    ON "error_events"("event_id", "occurred_at");
CREATE INDEX "error_events_environment_occurred_event_idx"
    ON "error_events"("environment_id", "occurred_at" DESC, "event_id" DESC);
CREATE INDEX "error_events_occurred_at_brin_idx" ON "error_events" USING BRIN ("occurred_at");
