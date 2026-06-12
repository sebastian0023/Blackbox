import type { ServerConfig } from '@blackbox/config';
import { TelemetryWorkerModule } from '@blackbox/server';
import { Module, type DynamicModule } from '@nestjs/common';
import { WorkerRuntimeService } from './worker-runtime.service';

@Module({})
export class WorkerAppModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      module: WorkerAppModule,
      imports: [TelemetryWorkerModule.register(config)],
      providers: [WorkerRuntimeService],
    };
  }
}
