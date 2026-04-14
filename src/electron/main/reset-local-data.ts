// Local data reset helpers.

import fs from 'node:fs/promises';
import path from 'node:path';

const removePathOptions = {
  force: true,
  maxRetries: 3,
  recursive: true,
  retryDelay: 100,
} as const;

/** Reset local data options. */
export interface ResetLocalDataOptions {
  agentLiteRuntimeRoot: string;
  userDataDir: string;
}

/** Clears directory contents. */
async function clearDirectoryContents(dir: string) {
  try {
    const entries = await fs.readdir(dir);

    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(dir, entry), removePathOptions),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

/** Resets local data. */
export async function resetLocalData({
  agentLiteRuntimeRoot,
  userDataDir,
}: ResetLocalDataOptions) {
  await Promise.all([
    clearDirectoryContents(userDataDir),
    fs.rm(agentLiteRuntimeRoot, removePathOptions),
  ]);
}
