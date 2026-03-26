const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
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
const betterSqliteRoot = path.join(rootDir, 'node_modules', 'better-sqlite3');
const electronPackageJsonPath = path.join(rootDir, 'node_modules', 'electron', 'package.json');

function run(command, args, cwd = rootDir) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(agentLitePackageRoot) || !fs.existsSync(electronPackageJsonPath)) {
  process.exit(0);
}

if (!fs.existsSync(agentLiteDistEntry)) {
  if (!fs.existsSync(tscCommand)) {
    throw new Error('TypeScript compiler was not found while preparing AgentLite.');
  }

  run(tscCommand, ['-p', path.join(agentLitePackageRoot, 'tsconfig.json')], rootDir);
}

if (fs.existsSync(betterSqliteRoot)) {
  const electronVersion = JSON.parse(fs.readFileSync(electronPackageJsonPath, 'utf8')).version;

  run(
    npmCommand,
    [
      'rebuild',
      'better-sqlite3',
      '--runtime=electron',
      `--target=${electronVersion}`,
      '--dist-url=https://electronjs.org/headers',
      '--build-from-source',
    ],
    rootDir,
  );
}
