ALTER TABLE "telemetry_event_ids"
    DROP CONSTRAINT "telemetry_event_ids_type_heartbeat";

ALTER TABLE "telemetry_event_ids"
    ADD CONSTRAINT "telemetry_event_ids_type_valid"
        CHECK ("event_type" IN ('heartbeat', 'process_metric'));

CREATE TABLE "process_metric_events" (
    "event_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpu_percent" DOUBLE PRECISION NOT NULL,
    "rss_bytes" BIGINT NOT NULL,
    "uptime_ms" BIGINT NOT NULL,
    "event_loop_delay_p99_ms" DOUBLE PRECISION NOT NULL,
    "dropped_events" BIGINT NOT NULL,
    "service_name" VARCHAR(100) NOT NULL,
    "service_version" VARCHAR(100),
    CONSTRAINT "process_metric_events_cpu_percent_bounded"
        CHECK ("cpu_percent" >= 0 AND "cpu_percent" <= 100000),
    CONSTRAINT "process_metric_events_rss_bytes_nonnegative" CHECK ("rss_bytes" >= 0),
    CONSTRAINT "process_metric_events_uptime_nonnegative" CHECK ("uptime_ms" >= 0),
    CONSTRAINT "process_metric_events_event_loop_delay_bounded"
        CHECK ("event_loop_delay_p99_ms" >= 0 AND "event_loop_delay_p99_ms" <= 86400000),
    CONSTRAINT "process_metric_events_dropped_events_nonnegative" CHECK ("dropped_events" >= 0),
    CONSTRAINT "process_metric_events_batch_id_fkey"
        FOREIGN KEY ("batch_id") REFERENCES "telemetry_batches"("batch_id") ON DELETE CASCADE,
    CONSTRAINT "process_metric_events_environment_id_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE
) PARTITION BY RANGE ("occurred_at");

CREATE TABLE "process_metric_events_2026_06"
    PARTITION OF "process_metric_events"
    FOR VALUES FROM ('2026-06-01T00:00:00Z') TO ('2026-07-01T00:00:00Z');

CREATE TABLE "process_metric_events_2026_07"
    PARTITION OF "process_metric_events"
    FOR VALUES FROM ('2026-07-01T00:00:00Z') TO ('2026-08-01T00:00:00Z');

CREATE TABLE "process_metric_events_default"
    PARTITION OF "process_metric_events" DEFAULT;

CREATE UNIQUE INDEX "process_metric_events_event_id_occurred_at_key"
    ON "process_metric_events"("event_id", "occurred_at");
CREATE INDEX "process_metric_events_environment_occurred_event_idx"
    ON "process_metric_events"("environment_id", "occurred_at" DESC, "event_id" DESC);
CREATE INDEX "process_metric_events_occurred_at_brin_idx"
    ON "process_metric_events" USING BRIN ("occurred_at");
