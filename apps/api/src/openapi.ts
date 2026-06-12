import { SESSION_COOKIE_NAME } from '@blackbox/server';
import { DocumentBuilder, type OpenAPIObject } from '@nestjs/swagger';

export function buildOpenApiConfig(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('Blackbox API')
    .setDescription('Blackbox control-plane API')
    .setVersion('1')
    .addCookieAuth(SESSION_COOKIE_NAME, { type: 'apiKey', in: 'cookie' }, 'session')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Blackbox-Ingest-Key' }, 'ingestKey')
    .build();
}
