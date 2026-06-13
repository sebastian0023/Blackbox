import {
  TELEMETRY_METADATA_MAX_ARRAY_ITEMS,
  TELEMETRY_METADATA_MAX_DEPTH,
  TELEMETRY_METADATA_MAX_KEYS,
  TELEMETRY_STRING_MAX_LENGTH,
} from '@blackbox/contracts';
import { ValidateBy, type ValidationOptions } from 'class-validator';

const DEFAULT_SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'x-blackbox-ingest-key',
]);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function IsSafeTelemetryMetadata(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isSafeTelemetryMetadata',
      validator: {
        defaultMessage: () => 'metadata must be bounded and contain only redacted sensitive values',
        validate: (value) => isSafeValue(value, '', 0, new WeakSet()),
      },
    },
    validationOptions,
  );
}

function isSafeValue(value: unknown, key: string, depth: number, seen: WeakSet<object>): boolean {
  if (DEFAULT_SENSITIVE_KEYS.has(key.toLowerCase())) {
    return value === '[REDACTED]';
  }
  if (UNSAFE_KEYS.has(key.toLowerCase())) {
    return false;
  }
  if (value === null || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'string') {
    return value.length <= TELEMETRY_STRING_MAX_LENGTH;
  }
  if (depth >= TELEMETRY_METADATA_MAX_DEPTH || value === null || typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.length <= TELEMETRY_METADATA_MAX_ARRAY_ITEMS &&
      value.every((child) => isSafeValue(child, '', depth + 1, seen))
    : isPlainObject(value) &&
      Object.keys(value).length <= TELEMETRY_METADATA_MAX_KEYS &&
      Object.entries(value).every(([childKey, child]) =>
        isSafeValue(child, childKey, depth + 1, seen),
      );
  seen.delete(value);
  return valid;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
