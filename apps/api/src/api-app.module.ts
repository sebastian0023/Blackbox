import type { ServerConfig } from '@blackbox/config';
import { ControlPlaneModule, HealthModule, type ReadinessProbeOverrides } from '@blackbox/server';
import {
  Module,
  RequestMethod,
  ValidationPipe,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

export interface ApiAppModuleOptions {
  readonly config: ServerConfig;
  readonly probes?: ReadinessProbeOverrides;
}

@Module({})
export class ApiAppModule implements NestModule {
  static register(options: ApiAppModuleOptions): DynamicModule {
    return {
      module: ApiAppModule,
      imports: [ControlPlaneModule.register(options), HealthModule.register(options)],
      providers: [
        {
          provide: APP_PIPE,
          useFactory: () =>
            new ValidationPipe({
              forbidNonWhitelisted: true,
              transform: true,
              whitelist: true,
            }),
        },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(SecurityHeadersMiddleware)
      .forRoutes({ method: RequestMethod.ALL, path: '{*path}' });
  }
}
