import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const require = createRequire(import.meta.url);
const { HeartbeatRuntime } = require(join(root, 'packages/sdk-nestjs/dist/heartbeat-runtime.js'));
const durationMs = Number(process.env.BLACKBOX_SDK_OVERHEAD_DURATION_MS ?? 31_000);
const cpuTargetPercent = 1;
const rssTargetBytes = 10 * 1024 * 1024;
const deliveredTypes = [];

global.gc?.();
const rssBefore = process.memoryUsage().rss;
const cpuBefore = process.cpuUsage();
const startedAt = process.hrtime.bigint();
const runtime = new HeartbeatRuntime(
  {
    controlPlaneUrl: 'http://127.0.0.1:1',
    ingestKey: 'overhead-measurement-key',
    serviceName: 'phase5-overhead',
  },
  {
    fetch: async (_url, init) => {
      const batch = JSON.parse(String(init?.body));
      deliveredTypes.push(...batch.events.map(({ type }) => type));
      return new Response(null, { status: 202 });
    },
  },
);

await runtime.start();
await delay(durationMs);
await runtime.stop();
global.gc?.();

const elapsedMicros = Number((process.hrtime.bigint() - startedAt) / 1_000n);
const cpu = process.cpuUsage(cpuBefore);
const cpuPercent = ((cpu.user + cpu.system) / elapsedMicros) * 100;
const rssIncreaseBytes = Math.max(0, process.memoryUsage().rss - rssBefore);
const result = {
  cpuPercent: round(cpuPercent),
  durationMs,
  processMetricDelivered: deliveredTypes.includes('process_metric'),
  rssIncreaseBytes,
  targetCpuPercentBelow: cpuTargetPercent,
  targetRssIncreaseBytesBelow: rssTargetBytes,
};
console.log(JSON.stringify(result, null, 2));

if (!result.processMetricDelivered) {
  throw new Error('The default process-metric interval did not produce a metric');
}
if (result.cpuPercent >= cpuTargetPercent || result.rssIncreaseBytes >= rssTargetBytes) {
  throw new Error('Phase 5 SDK overhead target was not met');
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
