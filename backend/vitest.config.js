import { defineConfig } from 'vitest/config';

// Backend test config. ESM project (`"type": "module"`), Node environment.
// Coverage goes to coverage/ as lcov.info (for Code Climate) + a console table.
//
// ADMIN_EMAILS is set in-env so requireAdmin recognizes the test admin account
// (config.js builds the admin set from this var at import time; without it the
// dev@melodia.local fallback only applies when NODE_ENV=development).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.js'],
    env: {
      ADMIN_EMAILS: 'dev@melodia.local',
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.{test,spec}.js', 'src/routes/testHelpers.js'],
      reportsDirectory: './coverage',
    },
  },
});
