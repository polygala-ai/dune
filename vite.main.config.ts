import path from 'node:path';
import { defineConfig } from 'vite';

import { externalModules } from './build/external-modules';

export default defineConfig({
  build: {
    rollupOptions: {
      external: externalModules,
      output: {
        entryFileNames: 'main.js',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
