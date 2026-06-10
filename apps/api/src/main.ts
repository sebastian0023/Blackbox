import 'reflect-metadata';
import 'dotenv/config';
import { loadServerConfig } from '@blackbox/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiAppModule } from './api-app.module';

async function bootstrap(): Promise<void> {
  const config = loadServerConfig();
  const app = await NestFactory.create(ApiAppModule.register({ config }));
  const openApiConfig = new DocumentBuilder()
    .setTitle('Blackbox API')
    .setDescription('Blackbox control-plane API')
    .setVersion('1')
    .build();

  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('docs', app, openApiDocument, {
    jsonDocumentUrl: 'docs/openapi.json',
  });
  app.enableShutdownHooks();
  await app.listen(config.apiPort, config.apiHost);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown API startup failure';
  Logger.error(message, 'ApiBootstrap');
  process.exitCode = 1;
});
