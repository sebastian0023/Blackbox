import type { ServerConfig } from '@blackbox/config';
import { PrismaClient } from '@blackbox/database';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { SERVER_CONFIG } from '../health/health.constants';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    super({
      datasources: {
        db: { url: config.databaseUrl },
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
