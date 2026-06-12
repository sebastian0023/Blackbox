import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SecretService {
  createOpaqueSecret(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  hash(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  matchesHash(secret: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(secret), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
