// Vitest configuration.

import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@build',
        replacement: path.resolve(__dirname, 'build'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, 'src'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/renderer/app/testing/setup.ts'],
    testTimeout: 15_000,
    exclude: ['tests/e2e/**'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'build/**/*.test.ts',
        'src/electron/main.ts',
        'src/electron/preload.ts',
        'tests/**',
      ],
    },
  },
});
