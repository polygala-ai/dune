// Local AgentLite runtime patch.

const fs = require('node:fs');
const path = require('node:path');

const TARGET_PATH = path.join(
  process.cwd(),
  'node_modules',
  '@boxlite-ai',
  'agentlite',
  'dist',
  'container-runner.js',
);

const OLD_SNIPPET = [
  "function ensureBackendSkillsSymlink(backendHomeDir) {",
  "    const skillsPath = path.join(backendHomeDir, 'skills');",
  "    if (fs.existsSync(skillsPath)) {",
  "        fs.rmSync(skillsPath, { recursive: true, force: true });",
  '    }',
  '    fs.symlinkSync(CONTAINER_SHARED_SKILLS_DIR, skillsPath);',
  '}',
].join('\n');

const PATCHED_SNIPPET = [
  "function ensureBackendSkillsSymlink(backendHomeDir) {",
  "    const skillsPath = path.join(backendHomeDir, 'skills');",
  "    fs.rmSync(skillsPath, { recursive: true, force: true });",
  '    fs.symlinkSync(CONTAINER_SHARED_SKILLS_DIR, skillsPath);',
  '}',
].join('\n');

function main() {
  if (!fs.existsSync(TARGET_PATH)) {
    throw new Error(`AgentLite container runner was not found at ${TARGET_PATH}.`);
  }

  const currentSource = fs.readFileSync(TARGET_PATH, 'utf8');

  if (currentSource.includes(PATCHED_SNIPPET)) {
    return;
  }

  if (!currentSource.includes(OLD_SNIPPET)) {
    throw new Error('AgentLite container runner did not match the expected skills symlink code.');
  }

  fs.writeFileSync(
    TARGET_PATH,
    currentSource.replace(OLD_SNIPPET, PATCHED_SNIPPET),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
