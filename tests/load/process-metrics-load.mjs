import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const apiUrl = (process.env.BLACKBOX_LOAD_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/u, '');
const durationSeconds = Number(process.env.BLACKBOX_LOAD_DURATION_SECONDS ?? 10);
const eventsPerSecond = 100;
const latencyTargetMs = 250;

if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 60) {
  throw new Error('BLACKBOX_LOAD_DURATION_SECONDS must be an integer from 1 to 60');
}

const unique = randomUUID();
const registration = await jsonRequest('/v1/auth/register', {
  body: {
    email: `phase5-load+${unique}@example.com`,
    password: 'PhaseFiveLoadPassword!23',
    teamName: 'Phase 5 load team',
  },
  expectedStatus: 201,
  method: 'POST',
});
const cookie = registration.response.headers.get('set-cookie')?.split(';', 1)[0];
const csrfToken = registration.body.csrfToken;
const teamId = registration.body.teams[0]?.id;
if (!cookie || typeof csrfToken !== 'string' || typeof teamId !== 'string') {
  throw new Error('Registration did not establish the expected load-test session');
}

const authenticatedHeaders = { Cookie: cookie, 'X-CSRF-Token': csrfToken };
const project = await jsonRequest(`/v1/teams/${teamId}/projects`, {
  body: { name: `Phase 5 load ${unique}` },
  expectedStatus: 201,
  headers: authenticatedHeaders,
  method: 'POST',
});
const environment = await jsonRequest(
  `/v1/teams/${teamId}/projects/${project.body.id}/environments`,
  {
    body: { name: 'load' },
    expectedStatus: 201,
    headers: authenticatedHeaders,
    method: 'POST',
  },
);
const key = await jsonRequest(
  `/v1/teams/${teamId}/projects/${project.body.id}/environments/${environment.body.id}/ingest-keys`,
  {
    body: { name: 'load' },
    expectedStatus: 201,
    headers: authenticatedHeaders,
    method: 'POST',
  },
);

const ingestLatencies = [];
const startedAt = performance.now();
for (let second = 0; second < durationSeconds; second += 1) {
  const scheduledAt = startedAt + second * 1_000;
  await delay(Math.max(0, scheduledAt - performance.now()));
  const batchStartedAt = performance.now();
  await jsonRequest('/v1/ingest/batches', {
    body: metricBatch(eventsPerSecond),
    expectedStatus: 202,
    headers: { 'X-Blackbox-Ingest-Key': key.body.key },
    method: 'POST',
  });
  ingestLatencies.push(performance.now() - batchStartedAt);
}
await delay(Math.max(0, startedAt + durationSeconds * 1_000 - performance.now()));

const queryPath = `/v1/teams/${teamId}/projects/${project.body.id}/environments/${environment.body.id}/process-metrics`;
const persistedEvents = await waitForMetricCount(
  queryPath,
  cookie,
  durationSeconds * eventsPerSecond,
);
const queryLatencies = [];
for (let requestIndex = 0; requestIndex < 20; requestIndex += 1) {
  const queryStartedAt = performance.now();
  await jsonRequest(`${queryPath}?limit=100`, {
    expectedStatus: 200,
    headers: { Cookie: cookie },
    method: 'GET',
  });
  queryLatencies.push(performance.now() - queryStartedAt);
}

const result = {
  acceptedEvents: durationSeconds * eventsPerSecond,
  durationSeconds,
  ingestP95Ms: round(percentile(ingestLatencies, 95)),
  persistedEvents,
  queryP95Ms: round(percentile(queryLatencies, 95)),
  targetEventsPerSecond: eventsPerSecond,
  targetP95Ms: latencyTargetMs,
};
console.log(JSON.stringify(result, null, 2));

if (result.ingestP95Ms >= latencyTargetMs || result.queryP95Ms >= latencyTargetMs) {
  throw new Error('Phase 5 load-test latency target was not met');
}

function metricBatch(eventCount) {
  const occurredAt = new Date().toISOString();
  return {
    batchId: randomUUID(),
    events: Array.from({ length: eventCount }, () => ({
      cpuPercent: 12.5,
      droppedEvents: 0,
      eventId: randomUUID(),
      eventLoopDelayP99Ms: 4.25,
      occurredAt,
      rssBytes: 64 * 1024 * 1024,
      serviceName: 'phase5-load',
      serviceVersion: '1.0.0',
      type: 'process_metric',
      uptimeMs: 12_345,
    })),
    sentAt: occurredAt,
    version: 1,
  };
}

async function waitForMetricCount(path, sessionCookie, expectedCount) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let count = 0;
    let cursor;
    do {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) {
        query.set('cursor', cursor);
      }
      const result = await jsonRequest(`${path}?${query}`, {
        expectedStatus: 200,
        headers: { Cookie: sessionCookie },
        method: 'GET',
      });
      count += result.body.items.length;
      cursor = result.body.nextCursor;
    } while (cursor);
    if (count === expectedCount) {
      return count;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${expectedCount} process metrics to become queryable`);
}

async function jsonRequest(path, { body, expectedStatus, headers = {}, method }) {
  const response = await fetch(`${apiUrl}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    method,
  });
  const responseBody = await response.json().catch(() => null);
  if (response.status !== expectedStatus) {
    throw new Error(
      `${method} ${path} returned ${response.status}: ${JSON.stringify(responseBody)}`,
    );
  }
  return { body: responseBody, response };
}

function percentile(values, requestedPercentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((requestedPercentile / 100) * sorted.length) - 1)] ?? 0;
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
