// Vite configuration for the Electron main process bundle.

import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

import { isExternalModuleId } from './build/external-modules';

/** Externalizes configured modules. */
function externalizeConfiguredModules(): Plugin {
  return {
    enforce: 'pre',
    name: 'externalize-configured-modules',
    resolveId(source) {
      if (isExternalModuleId(source)) {
        return {
          external: true,
          id: source,
        };
      }

      return null;
    },
  };
}

export default defineConfig({
  plugins: [externalizeConfiguredModules()],
  build: {
    rollupOptions: {
      external: (importId) => isExternalModuleId(importId),
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
