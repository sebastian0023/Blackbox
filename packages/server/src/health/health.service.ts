import type { DependencyReadiness, LivenessResponse, ReadinessResponse } from '@blackbox/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { POSTGRES_READINESS_PROBE, REDIS_READINESS_PROBE } from './health.constants';
import type { ReadinessProbe } from './health.types';

@Injectable()
export class HealthService {
  constructor(
    @Inject(POSTGRES_READINESS_PROBE) private readonly postgresProbe: ReadinessProbe,
    @Inject(REDIS_READINESS_PROBE) private readonly redisProbe: ReadinessProbe,
  ) {}

  getLiveness(): LivenessResponse {
    return { status: 'ok' };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const [postgres, redis] = await Promise.all([
      this.checkDependency(this.postgresProbe),
      this.checkDependency(this.redisProbe),
    ]);

    return {
      dependencies: { postgres, redis },
      status: postgres.status === 'ready' && redis.status === 'ready' ? 'ready' : 'degraded',
    };
  }

  private async checkDependency(probe: ReadinessProbe): Promise<DependencyReadiness> {
    try {
      await probe.check();
      return { status: 'ready' };
    } catch {
      return { status: 'unavailable' };
    }
  }
}
