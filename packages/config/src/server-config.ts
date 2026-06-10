import { z } from 'zod';

const postgresUrl = z
  .string()
  .url()
  .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), {
    message: 'must use the postgres or postgresql protocol',
  });

const redisUrl = z
  .string()
  .url()
  .refine((value) => ['redis:', 'rediss:'].includes(new URL(value).protocol), {
    message: 'must use the redis or rediss protocol',
  });

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: postgresUrl,
  REDIS_URL: redisUrl,
  DEPENDENCY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2000),
});

export interface ServerConfig {
  readonly apiHost: string;
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly dependencyTimeoutMs: number;
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly redisUrl: string;
}

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = serverEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid server configuration: ${details}`);
  }

  return Object.freeze({
    apiHost: result.data.API_HOST,
    apiPort: result.data.API_PORT,
    databaseUrl: result.data.DATABASE_URL,
    dependencyTimeoutMs: result.data.DEPENDENCY_TIMEOUT_MS,
    nodeEnv: result.data.NODE_ENV,
    redisUrl: result.data.REDIS_URL,
  });
}
