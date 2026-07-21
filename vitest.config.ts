import { defineConfig } from 'vitest/config';

export default defineConfig({
  // the @trace / @initLoxer decorators rely on TypeScript's legacy decorators
  // (tsconfig `experimentalDecorators`); tell Vite's oxc transformer to emit them.
  oxc: {
    decorator: {
      legacy: true,
    },
  },
  test: {
    // describe/test/expect and the lifecycle hooks stay global, matching the
    // previous Jest setup so the suites need no per-file imports.
    globals: true,
    environment: 'node',
    include: [
      // all tests
      'test/**/*.test.ts',
      // only tests set with `.test.only` (see rules/testing.md)
      'test/**/*.test.only.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
