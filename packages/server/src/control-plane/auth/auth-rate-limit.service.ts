import type { ServerConfig } from '@blackbox/config';
import {
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { SERVER_CONFIG } from '../../health/health.constants';
import { SecretService } from '../security/secret.service';

const LOGIN_ACCOUNT_LIMIT = 10;
const LOGIN_PAIR_LIMIT = 5;
const LOGIN_SOURCE_LIMIT = 50;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_ATTEMPT_LIMIT = 10;
const REGISTRATION_WINDOW_MS = 15 * 60 * 1000;

class AuthenticationRateLimitExceeded extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    @Inject(SERVER_CONFIG) config: ServerConfig,
    @Inject(SecretService) private readonly secrets: SecretService,
  ) {
    this.redis = new Redis(config.redisUrl, {
      commandTimeout: config.dependencyTimeoutMs,
      connectTimeout: config.dependencyTimeoutMs,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    this.redis.on('error', () => undefined);
  }

  async consumeLoginAttempt(email: string, ipAddress: string): Promise<void> {
    await this.consume(
      this.loginPairKey(email, ipAddress),
      LOGIN_PAIR_LIMIT,
      LOGIN_WINDOW_MS,
      'Too many authentication attempts',
    );
    await this.consume(
      `blackbox:auth:login-account:${this.secrets.hash(email.trim().toLowerCase())}`,
      LOGIN_ACCOUNT_LIMIT,
      LOGIN_WINDOW_MS,
      'Too many authentication attempts',
    );
    await this.consume(
      `blackbox:auth:login-source:${this.secrets.hash(ipAddress)}`,
      LOGIN_SOURCE_LIMIT,
      LOGIN_WINDOW_MS,
      'Too many authentication attempts',
    );
  }

  async consumeRegistrationAttempt(ipAddress: string): Promise<void> {
    await this.consume(
      `blackbox:auth:register:${this.secrets.hash(ipAddress)}`,
      REGISTRATION_ATTEMPT_LIMIT,
      REGISTRATION_WINDOW_MS,
      'Too many registration attempts',
    );
  }

  async resetLoginAttempts(email: string, ipAddress: string): Promise<void> {
    try {
      await this.ensureConnected();
      await this.redis.del(
        this.loginPairKey(email, ipAddress),
        `blackbox:auth:login-account:${this.secrets.hash(email.trim().toLowerCase())}`,
      );
    } catch {
      throw new ServiceUnavailableException('Authentication temporarily unavailable');
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  private async consume(
    key: string,
    limit: number,
    windowMs: number,
    message: string,
  ): Promise<void> {
    try {
      await this.ensureConnected();
      const result = await this.redis.multi().incr(key).pexpire(key, windowMs, 'NX').exec();
      const incrementResult = result?.[0];
      const expirationResult = result?.[1];

      if (!incrementResult || incrementResult[0] || !expirationResult || expirationResult[0]) {
        throw new Error('Rate-limit transaction failed');
      }

      const attempts = Number(incrementResult[1]);

      if (!Number.isInteger(attempts)) {
        throw new Error('Invalid rate-limit response');
      }
      if (attempts > limit) {
        throw new AuthenticationRateLimitExceeded(message);
      }
    } catch (error) {
      if (error instanceof AuthenticationRateLimitExceeded) {
        throw error;
      }
      throw new ServiceUnavailableException('Authentication temporarily unavailable');
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'wait') {
      await this.redis.connect();
    }
    if (this.redis.status !== 'ready') {
      throw new Error('Rate-limit store unavailable');
    }
  }

  private loginPairKey(email: string, ipAddress: string): string {
    const normalizedEmail = email.trim().toLowerCase();
    return `blackbox:auth:login:${this.secrets.hash(`${normalizedEmail}\0${ipAddress}`)}`;
  }
}
