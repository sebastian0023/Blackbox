import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
      },
    },
  },
  resolve: {
    alias: {
      '@blackbox/config': `${root}packages/config/src/index.ts`,
      '@blackbox/contracts': `${root}packages/contracts/src/index.ts`,
      '@blackbox/database': `${root}packages/database/src/index.ts`,
      '@blackbox/server': `${root}packages/server/src/index.ts`,
      '@blackbox/testkit': `${root}packages/testkit/src/index.ts`,
    },
  },
  test: {
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
    exclude: ['**/dist/**', '**/node_modules/**', 'tests/integration/**'],
    include: ['apps/**/*.spec.ts', 'packages/**/*.spec.ts'],
  },
});
