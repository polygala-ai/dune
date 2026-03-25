import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/renderer/app/testing/setup.ts'],
    exclude: ['tests/e2e/**'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'build/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'build/**/*.test.ts',
        'src/electron/main/index.ts',
        'src/electron/preload/index.ts',
        'tests/**',
      ],
    },
  },
});
