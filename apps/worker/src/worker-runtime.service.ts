import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

@Injectable()
export class WorkerRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRuntimeService.name);
  private keepAliveTimer?: NodeJS.Timeout;

  onModuleInit(): void {
    this.logger.log('Worker foundation started');
    this.keepAliveTimer = setInterval(() => undefined, 60_000);
  }

  onModuleDestroy(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
  }
}
