import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const supportedCommands = new Set(['generate', 'validate']);
const command = process.argv[2];

if (!command || !supportedCommands.has(command)) {
  throw new Error(`Expected one database command: ${[...supportedCommands].join(', ')}`);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const environmentPath = join(root, '.env');

if (existsSync(environmentPath)) {
  process.loadEnvFile(environmentPath);
}

const databaseRequire = createRequire(join(root, 'packages/database/package.json'));
const prismaCli = databaseRequire.resolve('prisma/build/index.js');
const schemaPath = join(root, 'packages/database/prisma/schema.prisma');
const result = spawnSync(process.execPath, [prismaCli, command, '--schema', schemaPath], {
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
