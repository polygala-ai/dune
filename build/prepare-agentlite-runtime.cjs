// Packaged AgentLite runtime preparation.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const localAgentLiteSourceRoot = path.resolve(rootDir, '..', 'agentlite');
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
const agentLiteRuntimeEntry = path.join(
  agentLitePackageRoot,
  'dist',
  'agent',
  'agent-impl.js',
);
const AGENTLITE_SYNC_ENTRIES = [
  'package.json',
  'tsconfig.json',
  'tsup.config.ts',
  'src',
  'dist',
];

/** Returns whether an AgentLite source file should affect runtime freshness. */
function isAgentLiteRuntimeSourceFile(fileName) {
  return (
    (fileName.endsWith('.ts') || fileName.endsWith('.js')) &&
    !fileName.includes('.test.')
  );
}

/** Recursively returns the latest mtime under a directory. */
function getLatestMtimeMs(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) {
    return null;
  }

  let latest = null;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const nestedLatest = getLatestMtimeMs(absolutePath, predicate);

      if (nestedLatest !== null) {
        latest = latest === null ? nestedLatest : Math.max(latest, nestedLatest);
      }

      continue;
    }

    if (!predicate(entry.name, absolutePath)) {
      continue;
    }

    const fileMtime = fs.statSync(absolutePath).mtimeMs;
    latest = latest === null ? fileMtime : Math.max(latest, fileMtime);
  }

  return latest;
}

/** Returns whether the local AgentLite bundle should be rebuilt. */
function shouldBuildAgentLite() {
  if (!fs.existsSync(agentLiteDistEntry) || !fs.existsSync(agentLiteRuntimeEntry)) {
    return true;
  }

  const latestSourceMtimeMs = getLatestMtimeMs(
    path.join(agentLitePackageRoot, 'src'),
    isAgentLiteRuntimeSourceFile,
  );

  if (latestSourceMtimeMs === null) {
    return false;
  }

  const oldestBuiltArtifactMtimeMs = Math.min(
    fs.statSync(agentLiteDistEntry).mtimeMs,
    fs.statSync(agentLiteRuntimeEntry).mtimeMs,
  );

  return latestSourceMtimeMs > oldestBuiltArtifactMtimeMs;
}

/** Syncs the local AgentLite file override into node_modules when present. */
function syncLocalAgentLiteOverride() {
  if (!fs.existsSync(localAgentLiteSourceRoot) || !fs.existsSync(agentLitePackageRoot)) {
    return;
  }

  for (const entry of AGENTLITE_SYNC_ENTRIES) {
    const sourcePath = path.join(localAgentLiteSourceRoot, entry);
    const targetPath = path.join(agentLitePackageRoot, entry);

    if (!fs.existsSync(sourcePath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      continue;
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
  }
}

/** Runs the process. */
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

syncLocalAgentLiteOverride();

if (shouldBuildAgentLite()) {
  if (!fs.existsSync(tscCommand)) {
    throw new Error('TypeScript compiler was not found while preparing AgentLite.');
  }

  run(tscCommand, ['-p', path.join(agentLitePackageRoot, 'tsconfig.json')], rootDir);
}
