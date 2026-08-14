import { defineConfig } from 'vitest/config';

export default defineConfig({
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
