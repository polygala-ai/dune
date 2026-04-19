import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

await build({
  absWorkingDir: repoRoot,
  banner: {
    js: '#!/usr/bin/env node',
  },
  bundle: true,
  entryPoints: ['packages/dune-cli/src/index.ts'],
  format: 'esm',
  outfile: 'packages/dune-cli/dist/dune.js',
  platform: 'node',
  sourcemap: true,
  target: 'node20',
  tsconfig: 'tsconfig.json',
});
