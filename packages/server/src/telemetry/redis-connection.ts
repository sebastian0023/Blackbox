import type { ConnectionOptions } from 'bullmq';

export function redisConnectionOptions(redisUrl: string, worker = false): ConnectionOptions {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;

  return {
    db: Number.isInteger(database) ? database : 0,
    enableOfflineQueue: worker,
    host: url.hostname,
    maxRetriesPerRequest: worker ? null : 1,
    password: url.password || undefined,
    port: url.port ? Number(url.port) : 6379,
    retryStrategy: worker ? undefined : () => null,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    username: url.username || undefined,
  };
}
