import type { ServerConfig } from '@blackbox/config';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { SERVER_CONFIG } from './health.constants';
import type { ReadinessProbe } from './health.types';

@Injectable()
export class RedisReadinessProbe implements ReadinessProbe {
  constructor(@Inject(SERVER_CONFIG) private readonly config: ServerConfig) {}

  async check(): Promise<void> {
    const client = new Redis(this.config.redisUrl, {
      commandTimeout: this.config.dependencyTimeoutMs,
      connectTimeout: this.config.dependencyTimeoutMs,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });

    client.on('error', () => undefined);

    try {
      await client.connect();
      await client.ping();
    } finally {
      client.disconnect();
    }
  }
}
