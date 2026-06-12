ALTER TABLE "heartbeat_events"
    DROP CONSTRAINT "heartbeat_events_uptime_bounded",
    ADD CONSTRAINT "heartbeat_events_uptime_nonnegative" CHECK ("uptime_ms" >= 0);
