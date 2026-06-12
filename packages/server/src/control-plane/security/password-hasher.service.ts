import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

const PASSWORD_HASH_OPTIONS = Object.freeze({
  hashLength: 32,
  memoryCost: 65_536,
  parallelism: 1,
  timeCost: 3,
  type: argon2id,
});

@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, PASSWORD_HASH_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
