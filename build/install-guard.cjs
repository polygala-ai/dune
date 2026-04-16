// Install-time runtime guard.

const fs = require('node:fs');
const path = require('node:path');

const STALE_NATIVE_MODULES = [
  {
    description: 'AgentLite nested better-sqlite3',
    relativePath: path.join(
      'node_modules',
      '@boxlite-ai',
      'agentlite',
      'node_modules',
      'better-sqlite3',
    ),
  },
];
const LOCAL_AGENTLITE_SOURCE_RELATIVE_PATH = path.join('..', 'agentlite');
const INSTALLED_AGENTLITE_ROOT_RELATIVE_PATH = path.join(
  'node_modules',
  '@boxlite-ai',
  'agentlite',
);
const INSTALLED_AGENTLITE_PACKAGE_JSON_RELATIVE_PATH = path.join(
  INSTALLED_AGENTLITE_ROOT_RELATIVE_PATH,
  'package.json',
);
const INSTALLED_AGENTLITE_DIST_RELATIVE_PATH = path.join(
  INSTALLED_AGENTLITE_ROOT_RELATIVE_PATH,
  'dist',
  'agent',
  'agent-impl.js',
);

/** Reads a UTF-8 file when present. */
function readUtf8IfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

/** Reads a JSON file when present. */
function readJsonIfExists(filePath) {
  const text = readUtf8IfExists(filePath);

  return text ? JSON.parse(text) : null;
}

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

/** Finds local AgentLite override drift. */
function findLocalAgentLiteIssues(rootDir = process.cwd()) {
  const sourceRoot = path.resolve(rootDir, LOCAL_AGENTLITE_SOURCE_RELATIVE_PATH);
  const installedRoot = path.join(rootDir, INSTALLED_AGENTLITE_ROOT_RELATIVE_PATH);

  if (!fs.existsSync(sourceRoot) || !fs.existsSync(installedRoot)) {
    return [];
  }

  const sourcePackagePath = path.join(sourceRoot, 'package.json');
  const installedPackagePath = path.join(rootDir, INSTALLED_AGENTLITE_PACKAGE_JSON_RELATIVE_PATH);
  const sourcePackageText = readUtf8IfExists(sourcePackagePath);
  const installedPackageText = readUtf8IfExists(installedPackagePath);
  const issues = [];

  if (sourcePackageText && installedPackageText && sourcePackageText !== installedPackageText) {
    issues.push({
      absolutePath: installedPackagePath,
      description: 'Installed AgentLite package metadata is out of sync with ../agentlite.',
      relativePath: INSTALLED_AGENTLITE_PACKAGE_JSON_RELATIVE_PATH,
    });
  }

  const latestSourceMtimeMs = getLatestMtimeMs(
    path.join(sourceRoot, 'src'),
    isAgentLiteRuntimeSourceFile,
  );
  const installedRuntimeEntry = path.join(rootDir, INSTALLED_AGENTLITE_DIST_RELATIVE_PATH);

  if (latestSourceMtimeMs !== null && fs.existsSync(installedRuntimeEntry)) {
    const installedRuntimeMtimeMs = fs.statSync(installedRuntimeEntry).mtimeMs;

    if (latestSourceMtimeMs > installedRuntimeMtimeMs) {
      issues.push({
        absolutePath: installedRuntimeEntry,
        description: 'Installed AgentLite dist is older than ../agentlite/src.',
        relativePath: INSTALLED_AGENTLITE_DIST_RELATIVE_PATH,
      });
    }
  }

  const sourcePackageJson = readJsonIfExists(sourcePackagePath);
  const sourceDependencies = sourcePackageJson?.dependencies ?? {};

  if (sourceDependencies['@agentclientprotocol/sdk']) {
    try {
      require.resolve('@agentclientprotocol/sdk/package.json', {
        paths: [installedRoot],
      });
    } catch {
      issues.push({
        absolutePath: installedPackagePath,
        description: 'Installed AgentLite dependencies are missing @agentclientprotocol/sdk.',
        relativePath: INSTALLED_AGENTLITE_PACKAGE_JSON_RELATIVE_PATH,
      });
    }
  }

  return issues;
}

/** Returns whether the env is a pnpm execution. */
function isPnpmExecution(env = process.env) {
  const userAgent = env.npm_config_user_agent ?? '';
  const execPath = env.npm_execpath ?? '';

  return userAgent.includes('pnpm/') || execPath.includes('pnpm');
}

/** Formats pnpm only message. */
function formatPnpmOnlyMessage() {
  return [
    'This repo is pnpm-only.',
    'Remove node_modules and package-lock.json, then run "pnpm install".',
  ].join(' ');
}

/** Finds install hygiene issues. */
function findInstallHygieneIssues(rootDir = process.cwd()) {
  const staleNativeModules = STALE_NATIVE_MODULES
    .map((entry) => ({
      ...entry,
      absolutePath: path.join(rootDir, entry.relativePath),
    }))
    .filter((entry) => fs.existsSync(entry.absolutePath));

  return [...staleNativeModules, ...findLocalAgentLiteIssues(rootDir)];
}

/** Formats install hygiene message. */
function formatInstallHygieneMessage(issues, rootDir = process.cwd()) {
  const relativeIssues = issues.map((issue) => {
    const relativePath = path.relative(rootDir, issue.absolutePath);

    return issue.description ? `${relativePath}: ${issue.description}` : relativePath;
  });

  return [
    'Detected stale install state:',
    ...relativeIssues.map((relativePath) => `- ${relativePath}`),
    'Remove node_modules and package-lock.json, then run "pnpm install --force".',
    'If ../agentlite/src changed, rebuild it first with "pnpm --dir ../agentlite build".',
  ].join('\n');
}

/** Asserts pnpm only. */
function assertPnpmOnly(env = process.env) {
  if (!isPnpmExecution(env)) {
    throw new Error(formatPnpmOnlyMessage());
  }
}

/** Asserts install hygiene. */
function assertInstallHygiene(rootDir = process.cwd()) {
  const issues = findInstallHygieneIssues(rootDir);

  if (issues.length > 0) {
    throw new Error(formatInstallHygieneMessage(issues, rootDir));
  }
}

/** Mains. */
function main(argv = process.argv.slice(2)) {
  const mode = argv[0];

  try {
    if (mode === 'package-manager') {
      assertPnpmOnly();
      return;
    }

    if (mode === 'install-hygiene') {
      assertInstallHygiene();
      return;
    }

    throw new Error(
      `Unknown install guard mode "${mode}". Expected "package-manager" or "install-hygiene".`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  assertInstallHygiene,
  assertPnpmOnly,
  findInstallHygieneIssues,
  findLocalAgentLiteIssues,
  formatInstallHygieneMessage,
  formatPnpmOnlyMessage,
  getLatestMtimeMs,
  isPnpmExecution,
  isAgentLiteRuntimeSourceFile,
  main,
  readJsonIfExists,
  readUtf8IfExists,
};
