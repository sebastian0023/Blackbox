import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('../../', import.meta.url);
const sourceMode = process.argv.includes('--source');
const baseEnvironment = {
  ...process.env,
  API_HOST: '127.0.0.1',
  API_PORT: '3100',
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://blackbox:blackbox@localhost:5432/blackbox',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

function start(relativeEntryPoint, environment = baseEnvironment, cwd = fileURLToPath(root)) {
  const absoluteEntryPoint = fileURLToPath(new URL(relativeEntryPoint, root));
  const command = sourceMode
    ? fileURLToPath(new URL('node_modules/.bin/tsx', root))
    : process.execPath;
  const args = sourceMode
    ? ['--tsconfig', fileURLToPath(new URL('tsconfig.base.json', root)), absoluteEntryPoint]
    : [absoluteEntryPoint];
  const child = spawn(command, args, {
    cwd,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';

  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });

  return { child, getOutput: () => output };
}

async function waitForResponse(url, expectedStatus, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status === expectedStatus) {
        return response;
      }
    } catch {
      // Startup is still in progress.
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for ${url} to return ${expectedStatus}`);
}

async function stop(running) {
  if (running.child.exitCode !== null) {
    return;
  }

  running.child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => running.child.once('exit', resolve)),
    delay(3000).then(() => running.child.kill('SIGKILL')),
  ]);
}

async function expectFailFast(relativeEntryPoint) {
  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  delete environment.REDIS_URL;
  const running = start(relativeEntryPoint, environment, fileURLToPath(new URL('tests/', root)));
  const exitCode = await Promise.race([
    new Promise((resolve) => running.child.once('exit', resolve)),
    delay(3000).then(() => 'timeout'),
  ]);

  if (exitCode === 'timeout') {
    await stop(running);
    throw new Error(`${relativeEntryPoint} did not fail fast within 3 seconds`);
  }
  if (exitCode === 0 || !running.getOutput().includes('Invalid server configuration')) {
    throw new Error(`${relativeEntryPoint} did not fail fast:\n${running.getOutput()}`);
  }
}

const extension = sourceMode ? 'src/main.ts' : 'dist/main.js';
const apiEntryPoint = `apps/api/${extension}`;
const workerEntryPoint = `apps/worker/${extension}`;
const exampleEntryPoint = `apps/example-nest/${extension}`;
const api = start(apiEntryPoint);
const worker = start(workerEntryPoint);
const example = start(exampleEntryPoint);

try {
  const live = await waitForResponse('http://127.0.0.1:3100/v1/health/live', 200);
  const ready = await waitForResponse('http://127.0.0.1:3100/v1/health/ready', 200);
  const openApi = await waitForResponse('http://127.0.0.1:3100/docs/openapi.json', 200);
  const exampleResponse = await waitForResponse('http://127.0.0.1:3001/', 200);

  if ((await live.json()).status !== 'ok') {
    throw new Error('API liveness payload was incorrect');
  }
  if ((await ready.json()).status !== 'ready') {
    throw new Error('API readiness payload was incorrect');
  }
  const openApiDocument = await openApi.json();
  if (!openApiDocument.paths?.['/v1/health/live'] || !openApiDocument.paths?.['/v1/health/ready']) {
    throw new Error('OpenAPI did not document both health endpoints');
  }
  if (
    !openApiDocument.components?.schemas?.LivenessResponseModel ||
    !openApiDocument.components?.schemas?.ReadinessResponseModel ||
    !openApiDocument.components?.schemas?.DependencyReadinessModel
  ) {
    throw new Error('OpenAPI did not document health response schemas');
  }
  if ((await exampleResponse.json()).status !== 'ok') {
    throw new Error('Example application payload was incorrect');
  }
  if (worker.child.exitCode !== null) {
    throw new Error(`Worker exited during smoke test:\n${worker.getOutput()}`);
  }

  await expectFailFast(apiEntryPoint);
  await expectFailFast(workerEntryPoint);
} finally {
  await Promise.all([stop(api), stop(worker), stop(example)]);
}
