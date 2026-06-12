import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher.service';

describe('PasswordHasher', () => {
  it('uses Argon2id and verifies only the matching password', async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(hasher.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong password')).resolves.toBe(false);
  });
});
