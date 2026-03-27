const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const tscCommand = path.join(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
);
const agentLitePackageRoot = path.join(
  rootDir,
  'node_modules',
  '@boxlite-ai',
  'agentlite',
);
const agentLiteDistEntry = path.join(agentLitePackageRoot, 'dist', 'sdk.js');

function run(command, args, cwd = rootDir) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(agentLitePackageRoot)) {
  process.exit(0);
}

if (!fs.existsSync(agentLiteDistEntry)) {
  if (!fs.existsSync(tscCommand)) {
    throw new Error('TypeScript compiler was not found while preparing AgentLite.');
  }

  run(tscCommand, ['-p', path.join(agentLitePackageRoot, 'tsconfig.json')], rootDir);
}
