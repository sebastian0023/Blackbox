import { TELEMETRY_EVENT_MAX_BYTES, type TelemetryBatch } from '@blackbox/contracts';

export function hasValidTelemetryEventSizes(batch: TelemetryBatch): boolean {
  return batch.events.every(
    (event) => Buffer.byteLength(JSON.stringify(event), 'utf8') <= TELEMETRY_EVENT_MAX_BYTES,
  );
}
