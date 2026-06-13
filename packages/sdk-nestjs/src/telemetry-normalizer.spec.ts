import { describe, expect, it } from 'vitest';
import {
  normalizeError,
  normalizeMessage,
  normalizeMetadata,
  normalizePolicy,
} from './telemetry-normalizer';

describe('telemetry normalization', () => {
  it('allowlists top-level metadata and recursively redacts sensitive keys', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const metadata = normalizeMetadata(
      {
        ignored: 'must not leave',
        safe: {
          authorization: 'Bearer secret',
          nested: { PASSWORD: 'secret', value: 'allowed' },
          unsupported: () => 'no',
        },
        circular,
      },
      normalizePolicy(['safe', 'circular'], ['authorization', 'password']),
    );

    expect(metadata).toEqual({
      circular: {},
      safe: {
        authorization: '[REDACTED]',
        nested: { PASSWORD: '[REDACTED]', value: 'allowed' },
      },
    });
    expect(JSON.stringify(metadata)).not.toContain('Bearer secret');
    expect(JSON.stringify(metadata)).not.toContain('must not leave');
  });

  it('omits prototype-pollution keys even when explicitly allowlisted', () => {
    const value = JSON.parse(
      '{"safe":{"__proto__":{"polluted":true},"constructor":"bad","value":"ok"}}',
    ) as unknown;
    const metadata = normalizeMetadata(value, normalizePolicy(['safe'], []));

    expect(metadata).toEqual({ safe: { value: 'ok' } });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('bounds messages, stacks, arrays, keys, and recursive depth', () => {
    const error = new Error('m'.repeat(3_000));
    error.stack = 's'.repeat(20_000);
    const metadata = normalizeMetadata(
      {
        safe: {
          array: Array.from({ length: 30 }, (_, index) => index),
          deep: { one: { two: { three: { four: { five: 'omitted' } } } } },
          ...Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`key${index}`, index])),
        },
      },
      normalizePolicy(['safe'], []),
    );

    expect(normalizeMessage('x'.repeat(3_000))).toHaveLength(2_048);
    expect(normalizeError(error).stack).toHaveLength(16 * 1_024);
    const safe = metadata?.safe as Record<string, unknown>;
    expect(Object.keys(safe)).toHaveLength(16);
    expect(safe.array as unknown[]).toHaveLength(20);
    expect(JSON.stringify(metadata)).not.toContain('omitted');
  });
});
