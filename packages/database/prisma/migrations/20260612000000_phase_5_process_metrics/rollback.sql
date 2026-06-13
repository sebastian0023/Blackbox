DROP TABLE IF EXISTS "process_metric_events";

DELETE FROM "telemetry_event_ids" WHERE "event_type" = 'process_metric';

ALTER TABLE "telemetry_event_ids"
    DROP CONSTRAINT "telemetry_event_ids_type_valid";

ALTER TABLE "telemetry_event_ids"
    ADD CONSTRAINT "telemetry_event_ids_type_heartbeat"
        CHECK ("event_type" = 'heartbeat');
