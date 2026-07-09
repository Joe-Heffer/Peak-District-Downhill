import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'tools/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Global floor the suite must clear; CI fails the build if any metric drops
      // below its number. Set a little under today's baseline so genuine
      // regressions fail the build without making the threshold flaky.
      thresholds: {
        statements: 78,
        branches: 78,
        functions: 75,
        lines: 78,
      },
    },
  },
});
