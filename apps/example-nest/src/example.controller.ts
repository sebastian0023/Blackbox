import { BlackboxLogger, BlackboxRuntimeService } from '@blackbox/nestjs';
import { Controller, Get, Inject, Post } from '@nestjs/common';
import { ExampleHostLogger } from './example-host.logger';

@Controller()
export class ExampleController {
  constructor(
    @Inject(BlackboxRuntimeService) private readonly blackbox: BlackboxRuntimeService,
    @Inject(BlackboxLogger) private readonly blackboxLogger: BlackboxLogger,
    @Inject(ExampleHostLogger) private readonly hostLogger: ExampleHostLogger,
  ) {}

  @Get()
  getWelcome(): { readonly name: string; readonly status: 'ok' } {
    return { name: 'Blackbox example NestJS application', status: 'ok' };
  }

  @Post('phase6-telemetry')
  capturePhase6Telemetry(): { readonly hostLogForwarded: boolean; readonly status: 'ok' } {
    const forwardedBefore = this.hostLogger.forwardedCalls;
    this.blackboxLogger.warn(
      'Example structured log',
      {
        ignored: 'prohibited-value',
        safe: { password: 'example-password', requestId: 'example-request' },
      },
      'ExampleController',
    );
    this.blackbox.captureError(new Error('Example application error'), {
      safe: { token: 'example-token' },
    });
    return {
      hostLogForwarded: this.hostLogger.forwardedCalls === forwardedBefore + 1,
      status: 'ok',
    };
  }
}
