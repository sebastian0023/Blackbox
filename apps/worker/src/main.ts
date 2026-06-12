import 'reflect-metadata';
import 'dotenv/config';
import { loadServerConfig } from '@blackbox/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerAppModule } from './worker-app.module';

async function bootstrap(): Promise<void> {
  const config = loadServerConfig();
  const app = await NestFactory.createApplicationContext(WorkerAppModule.register(config));
  app.enableShutdownHooks();
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown worker startup failure';
  Logger.error(message, 'WorkerBootstrap');
  process.exitCode = 1;
});
