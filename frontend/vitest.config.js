import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Frontend test config. jsdom for DOM APIs (getBoundingClientRect, etc.).
// CSS imports are stubbed (Vite handles them at build time, not in tests).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.{test,spec}.{js,jsx}', 'src/test/**'],
      reportsDirectory: './coverage',
    },
  },
  css: { modules: { classNameStrategy: 'non-scoped' } },
  resolve: {
    alias: {
      // Some components import CSS; vitest ignores plain .css by default.
    },
  },
});
