import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const apiUrl = 'http://127.0.0.1:3100';
const sharedEnvironment = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://blackbox:blackbox@localhost:5432/blackbox',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
};
const api = spawn(process.execPath, [join(root, 'apps/api/dist/main.js')], {
  env: { ...sharedEnvironment, API_HOST: '127.0.0.1', API_PORT: '3100' },
  stdio: 'inherit',
});
const worker = spawn(process.execPath, [join(root, 'apps/worker/dist/main.js')], {
  env: sharedEnvironment,
  stdio: 'inherit',
});

try {
  await waitForApi();
  const load = spawn(process.execPath, [join(root, 'tests/load/process-metrics-load.mjs')], {
    env: { ...sharedEnvironment, BLACKBOX_LOAD_API_URL: apiUrl },
    stdio: 'inherit',
  });
  const exitCode = await new Promise((resolve, reject) => {
    load.once('error', reject);
    load.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`Phase 5 load process exited with code ${exitCode}`);
  }
} finally {
  api.kill('SIGTERM');
  worker.kill('SIGTERM');
  await Promise.all([waitForExit(api), waitForExit(worker)]);
}

async function waitForApi() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (api.exitCode !== null || worker.exitCode !== null) {
      throw new Error('The API or worker exited before the Phase 5 load test started');
    }
    try {
      const response = await fetch(`${apiUrl}/v1/health/ready`);
      if (response.ok) {
        return;
      }
    } catch {
      // The bounded retry below handles startup.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for the Phase 5 load-test API');
}

function waitForExit(child) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once('exit', resolve));
}
