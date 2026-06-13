import {
  TELEMETRY_CONTEXT_MAX_LENGTH,
  TELEMETRY_METADATA_MAX_ARRAY_ITEMS,
  TELEMETRY_METADATA_MAX_DEPTH,
  TELEMETRY_METADATA_MAX_KEYS,
  TELEMETRY_STACK_MAX_LENGTH,
  TELEMETRY_STRING_MAX_LENGTH,
  type TelemetryMetadata,
  type TelemetryMetadataValue,
} from '@blackbox/contracts';

const REDACTED = '[REDACTED]';
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface MetadataPolicy {
  readonly allowlist: ReadonlySet<string>;
  readonly redactionKeys: ReadonlySet<string>;
}

export function normalizeContext(value: unknown): string | undefined {
  return normalizeOptionalString(value, TELEMETRY_CONTEXT_MAX_LENGTH);
}

export function normalizeError(value: unknown): { message: string; name: string; stack?: string } {
  if (value instanceof Error) {
    return {
      message: normalizeString(value.message),
      name: normalizeString(value.name || 'Error'),
      ...(value.stack ? { stack: normalizeString(value.stack, TELEMETRY_STACK_MAX_LENGTH) } : {}),
    };
  }
  return { message: normalizeString(value), name: 'Error' };
}

export function normalizeMessage(value: unknown): string {
  return normalizeString(value);
}

export function normalizeMetadata(
  value: unknown,
  policy: MetadataPolicy,
): TelemetryMetadata | undefined {
  if (!isPlainObject(value) || policy.allowlist.size === 0) {
    return undefined;
  }

  const result: Record<string, TelemetryMetadataValue> = {};
  const seen = new WeakSet<object>();
  for (const [key, child] of Object.entries(value)) {
    if (Object.keys(result).length >= TELEMETRY_METADATA_MAX_KEYS) {
      break;
    }
    if (!policy.allowlist.has(key) || UNSAFE_KEYS.has(key.toLowerCase())) {
      continue;
    }
    const normalized = normalizeValue(child, key, 1, policy.redactionKeys, seen);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function normalizePolicy(
  allowlist: readonly string[] | undefined,
  redactionKeys: readonly string[],
): MetadataPolicy {
  return {
    allowlist: new Set((allowlist ?? []).filter(Boolean)),
    redactionKeys: new Set(redactionKeys.filter(Boolean).map((key) => key.toLowerCase())),
  };
}

function normalizeValue(
  value: unknown,
  key: string,
  depth: number,
  redactionKeys: ReadonlySet<string>,
  seen: WeakSet<object>,
): TelemetryMetadataValue | undefined {
  if (redactionKeys.has(key.toLowerCase())) {
    return REDACTED;
  }
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    return normalizeString(value);
  }
  if (depth >= TELEMETRY_METADATA_MAX_DEPTH || typeof value !== 'object' || seen.has(value)) {
    return undefined;
  }

  seen.add(value);
  if (Array.isArray(value)) {
    const result = value
      .slice(0, TELEMETRY_METADATA_MAX_ARRAY_ITEMS)
      .map((child) => normalizeValue(child, '', depth + 1, redactionKeys, seen))
      .filter((child): child is TelemetryMetadataValue => child !== undefined);
    seen.delete(value);
    return result;
  }
  if (!isPlainObject(value)) {
    seen.delete(value);
    return undefined;
  }

  const result: Record<string, TelemetryMetadataValue> = {};
  for (const [childKey, child] of Object.entries(value).slice(0, TELEMETRY_METADATA_MAX_KEYS)) {
    if (UNSAFE_KEYS.has(childKey.toLowerCase())) {
      continue;
    }
    const normalized = normalizeValue(child, childKey, depth + 1, redactionKeys, seen);
    if (normalized !== undefined) {
      result[childKey] = normalized;
    }
  }
  seen.delete(value);
  return result;
}

function normalizeOptionalString(value: unknown, maxLength: number): string | undefined {
  return value === undefined || value === null ? undefined : normalizeString(value, maxLength);
}

function normalizeString(value: unknown, maxLength = TELEMETRY_STRING_MAX_LENGTH): string {
  let result: string;
  try {
    result = typeof value === 'string' ? value : String(value);
  } catch {
    result = '[Unserializable]';
  }
  return result.slice(0, maxLength);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
