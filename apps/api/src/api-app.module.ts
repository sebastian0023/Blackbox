import type { ServerConfig } from '@blackbox/config';
import { HealthModule, type ReadinessProbeOverrides } from '@blackbox/server';
import { Module, type DynamicModule } from '@nestjs/common';

export interface ApiAppModuleOptions {
  readonly config: ServerConfig;
  readonly probes?: ReadinessProbeOverrides;
}

@Module({})
export class ApiAppModule {
  static register(options: ApiAppModuleOptions): DynamicModule {
    return {
      module: ApiAppModule,
      imports: [HealthModule.register(options)],
    };
  }
}
