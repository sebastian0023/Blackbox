import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { POSTGRES_READINESS_PROBE, REDIS_READINESS_PROBE, SERVER_CONFIG } from './health.constants';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import type { HealthModuleOptions } from './health.types';
import { PostgresReadinessProbe } from './postgres-readiness.probe';
import { RedisReadinessProbe } from './redis-readiness.probe';

@Module({})
export class HealthModule {
  static register(options: HealthModuleOptions): DynamicModule {
    const postgresProvider: Provider = options.probes?.postgres
      ? { provide: POSTGRES_READINESS_PROBE, useValue: options.probes.postgres }
      : { provide: POSTGRES_READINESS_PROBE, useClass: PostgresReadinessProbe };
    const redisProvider: Provider = options.probes?.redis
      ? { provide: REDIS_READINESS_PROBE, useValue: options.probes.redis }
      : { provide: REDIS_READINESS_PROBE, useClass: RedisReadinessProbe };

    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [
        { provide: SERVER_CONFIG, useValue: options.config },
        postgresProvider,
        redisProvider,
        HealthService,
      ],
    };
  }
}
