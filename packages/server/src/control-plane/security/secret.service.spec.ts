import { describe, expect, it } from 'vitest';
import { SecretService } from './secret.service';

describe('SecretService', () => {
  it('creates high-entropy opaque secrets and compares only their hashes', () => {
    const secrets = new SecretService();
    const first = secrets.createOpaqueSecret();
    const second = secrets.createOpaqueSecret();
    const firstHash = secrets.hash(first);

    expect(first).not.toBe(second);
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstHash).not.toContain(first);
    expect(secrets.matchesHash(first, firstHash)).toBe(true);
    expect(secrets.matchesHash(second, firstHash)).toBe(false);
  });
});
