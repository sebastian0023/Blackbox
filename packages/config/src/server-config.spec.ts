import { describe, expect, it } from 'vitest';
import { loadServerConfig } from './server-config';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://blackbox:blackbox@localhost:5432/blackbox',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadServerConfig', () => {
  it('loads required values and applies bounded defaults', () => {
    const config = loadServerConfig(requiredEnvironment);

    expect(config).toEqual({
      apiHost: '0.0.0.0',
      apiPort: 3000,
      databaseUrl: requiredEnvironment.DATABASE_URL,
      dependencyTimeoutMs: 2000,
      nodeEnv: 'development',
      redisUrl: requiredEnvironment.REDIS_URL,
    });
  });

  it('rejects missing required configuration', () => {
    expect(() => loadServerConfig({})).toThrow(/DATABASE_URL.*REDIS_URL/);
  });

  it('rejects unsupported protocols and out-of-range values', () => {
    expect(() =>
      loadServerConfig({
        ...requiredEnvironment,
        API_PORT: '70000',
        DATABASE_URL: 'https://example.com/database',
        DEPENDENCY_TIMEOUT_MS: '99',
        REDIS_URL: 'https://example.com/redis',
      }),
    ).toThrow(/API_PORT.*DATABASE_URL.*REDIS_URL.*DEPENDENCY_TIMEOUT_MS/);
  });
});
