import { BlackboxModule, type BlackboxModuleOptions } from '@blackbox/nestjs';
import { Module, type DynamicModule } from '@nestjs/common';
import { ExampleController } from './example.controller';

@Module({})
export class ExampleAppModule {
  static register(
    options: BlackboxModuleOptions = {
      controlPlaneUrl: process.env.BLACKBOX_CONTROL_PLANE_URL ?? 'http://127.0.0.1:3000',
      ingestKey: process.env.BLACKBOX_INGEST_KEY ?? '',
      serviceName: 'blackbox-example',
      serviceVersion: '0.0.0',
    },
  ): DynamicModule {
    return {
      controllers: [ExampleController],
      imports: [BlackboxModule.forRoot(options)],
      module: ExampleAppModule,
    };
  }
}
