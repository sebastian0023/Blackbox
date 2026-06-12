import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExampleAppModule } from './example-app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ExampleAppModule.register());
  app.enableShutdownHooks();
  await app.listen(3001, '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown example app startup failure';
  Logger.error(message, 'ExampleBootstrap');
  process.exitCode = 1;
});
