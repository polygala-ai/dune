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

function isPnpmExecution(env = process.env) {
  const userAgent = env.npm_config_user_agent ?? '';
  const execPath = env.npm_execpath ?? '';

  return userAgent.includes('pnpm/') || execPath.includes('pnpm');
}

function formatPnpmOnlyMessage() {
  return [
    'This repo is pnpm-only.',
    'Remove node_modules and package-lock.json, then run "pnpm install".',
  ].join(' ');
}

function findInstallHygieneIssues(rootDir = process.cwd()) {
  return STALE_NATIVE_MODULES
    .map((entry) => ({
      ...entry,
      absolutePath: path.join(rootDir, entry.relativePath),
    }))
    .filter((entry) => fs.existsSync(entry.absolutePath));
}

function formatInstallHygieneMessage(issues, rootDir = process.cwd()) {
  const relativeIssues = issues.map((issue) => path.relative(rootDir, issue.absolutePath));

  return [
    'Detected stale native modules from a mixed install state:',
    ...relativeIssues.map((relativePath) => `- ${relativePath}`),
    'Remove node_modules and package-lock.json, then run "pnpm install --force".',
  ].join('\n');
}

function assertPnpmOnly(env = process.env) {
  if (!isPnpmExecution(env)) {
    throw new Error(formatPnpmOnlyMessage());
  }
}

function assertInstallHygiene(rootDir = process.cwd()) {
  const issues = findInstallHygieneIssues(rootDir);

  if (issues.length > 0) {
    throw new Error(formatInstallHygieneMessage(issues, rootDir));
  }
}

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
  formatInstallHygieneMessage,
  formatPnpmOnlyMessage,
  isPnpmExecution,
  main,
};
