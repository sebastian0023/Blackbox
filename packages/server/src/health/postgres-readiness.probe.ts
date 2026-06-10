import type { ServerConfig } from '@blackbox/config';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { SERVER_CONFIG } from './health.constants';
import type { ReadinessProbe } from './health.types';

@Injectable()
export class PostgresReadinessProbe implements ReadinessProbe, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: config.dependencyTimeoutMs,
      max: 1,
      query_timeout: config.dependencyTimeoutMs,
    });
  }

  async check(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
