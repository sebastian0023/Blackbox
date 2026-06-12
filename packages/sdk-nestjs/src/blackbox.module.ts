import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnModuleDestroy,
  type OnModuleInit,
  type Provider,
} from '@nestjs/common';
import {
  BLACKBOX_OPTIONS,
  type BlackboxModuleAsyncOptions,
  type BlackboxModuleOptions,
} from './blackbox-options';
import { HeartbeatRuntime } from './heartbeat-runtime';

@Injectable()
class BlackboxRuntimeService implements OnModuleDestroy, OnModuleInit {
  private readonly runtime: HeartbeatRuntime;

  constructor(@Inject(BLACKBOX_OPTIONS) options: BlackboxModuleOptions) {
    this.runtime = new HeartbeatRuntime(options);
  }

  onModuleInit(): Promise<void> {
    return this.runtime.start();
  }

  onModuleDestroy(): Promise<void> {
    return this.runtime.stop();
  }
}

@Module({})
export class BlackboxModule {
  static forRoot(options: BlackboxModuleOptions): DynamicModule {
    return this.create({ provide: BLACKBOX_OPTIONS, useValue: options });
  }

  static forRootAsync(options: BlackboxModuleAsyncOptions): DynamicModule {
    return {
      ...this.create({
        inject: options.inject ?? [],
        provide: BLACKBOX_OPTIONS,
        useFactory: options.useFactory,
      }),
      imports: options.imports,
    };
  }

  private static create(optionsProvider: Provider): DynamicModule {
    return {
      module: BlackboxModule,
      providers: [optionsProvider, BlackboxRuntimeService],
    };
  }
}
