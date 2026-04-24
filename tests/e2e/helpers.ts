// Shared Playwright helpers.

import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron } from 'playwright';
import { expect, type Locator } from '@playwright/test';

/** Electron app shape. */
export type ElectronApp = Awaited<ReturnType<typeof electron.launch>>;

/** Creates temp home. */
export function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-e2e-home-'));
}

/** Cleans up temp home. */
export function cleanupTempHome(dir: string) {
  fs.rmSync(dir, { force: true, recursive: true });
}

/** Returns user data dir. */
export function getUserDataDir(runtimeHome: string) {
  return path.join(runtimeHome, 'userdata');
}

/** Returns agent lite runtime root. */
export function getAgentLiteRuntimeRoot(runtimeHome: string) {
  return path.join(runtimeHome, '.dune', 'agentlite');
}

/** Reads desktop runtime chunk. */
export function readDesktopRuntimeChunk() {
  const appRoot = path.resolve(__dirname, '../../');
  const buildDir = path.join(appRoot, '.vite', 'build');
  const chunkName = fs.readdirSync(buildDir).find((entry) =>
    /^desktop-runtime-controller-.*\.js$/.test(entry),
  );

  if (!chunkName) {
    throw new Error('Desktop runtime controller chunk was not found in .vite/build.');
  }

  return fs.readFileSync(path.join(buildDir, chunkName), 'utf-8');
}

/** Reads user data JSON. */
export function readUserDataJson(runtimeHome: string, fileName: string) {
  return JSON.parse(
    fs.readFileSync(path.join(getUserDataDir(runtimeHome), fileName), 'utf-8'),
  ) as Record<string, unknown>;
}

/** Seeds agent store. */
export function seedAgentStore(
  runtimeHome: string,
  data: {
    agents: unknown[];
    selectedAgentId: string | null;
  },
) {
  const userDataDir = getUserDataDir(runtimeHome);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, 'agents.json'),
    JSON.stringify(data, null, 2),
  );
}

/** Seeds workflow store. */
export function seedWorkflowStore(
  runtimeHome: string,
  snapshot: {
    items: unknown[];
    projects: unknown[];
    selectedItemId: string | null;
    selectedProjectFilter: string;
    selectedProjectId: string | null;
    selectedProjectView: string;
  },
) {
  const userDataDir = getUserDataDir(runtimeHome);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, 'workflow.json'),
    JSON.stringify({ snapshot }, null, 2),
  );
}

/** Seeds agent attachment. */
export function seedAgentAttachment(
  runtimeHome: string,
  input: {
    content: Buffer | string;
    fileName: string;
    groupFolder: string;
  },
) {
  const attachmentDir = path.join(
    getAgentLiteRuntimeRoot(runtimeHome),
    'groups',
    input.groupFolder,
    'attachments',
  );
  fs.mkdirSync(attachmentDir, { recursive: true });
  fs.writeFileSync(path.join(attachmentDir, input.fileName), input.content);
}

/** Launches app. */
export async function launchApp(runtimeHome: string): Promise<ElectronApp> {
  const appRoot = path.resolve(__dirname, '../../');
  const userDataDir = getUserDataDir(runtimeHome);
  fs.mkdirSync(userDataDir, { recursive: true });
  return electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: appRoot,
    env: {
      ...process.env,
      DUNE_AGENTLITE_HOME_DIR: runtimeHome,
    },
  });
}

/** Returns modifier. */
export function getModifier() {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

/** App page shape. */
type AppPage = Awaited<ReturnType<ElectronApp['firstWindow']>>;

/** Dispatches window key. */
export async function dispatchWindowKey(
  page: AppPage,
  key: string,
  options?: {
    ctrlKey?: boolean;
    metaKey?: boolean;
  },
) {
  await page.evaluate(
    ({ ctrlKey, key, metaKey }) => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ctrlKey,
          key,
          metaKey,
        }),
      );
    },
    {
      ctrlKey: options?.ctrlKey ?? false,
      key,
      metaKey: options?.metaKey ?? false,
    },
  );
}

/** Dispatches primary shortcut. */
export async function dispatchPrimaryShortcut(page: AppPage, key: string) {
  const usesMeta = process.platform === 'darwin';
  await dispatchWindowKey(page, key, {
    ctrlKey: !usesMeta,
    metaKey: usesMeta,
  });
}

/** Resizes window. */
export async function resizeWindow(app: ElectronApp, width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }, bounds) => {
      const [window] = BrowserWindow.getAllWindows();
      if (!window) {
        throw new Error('Main window not found.');
      }
      window.setSize(bounds.width, bounds.height);
    },
    { height, width },
  );
}

/** Asserts right edge within. */
export async function expectRightEdgeWithin(container: Locator, item: Locator) {
  const [containerBox, itemBox] = await Promise.all([
    container.boundingBox(),
    item.boundingBox(),
  ]);

  if (!containerBox || !itemBox) {
    throw new Error('Expected both container and item to have bounding boxes.');
  }

  expect(itemBox.x + itemBox.width).toBeLessThanOrEqual(
    containerBox.x + containerBox.width + 1,
  );
}

/** Asserts bounding box within. */
export async function expectBoundingBoxWithin(container: Locator, item: Locator) {
  const [containerBox, itemBox] = await Promise.all([
    container.boundingBox(),
    item.boundingBox(),
  ]);

  if (!containerBox || !itemBox) {
    throw new Error('Expected both container and item to have bounding boxes.');
  }

  expect(itemBox.x).toBeGreaterThanOrEqual(containerBox.x - 1);
  expect(itemBox.y).toBeGreaterThanOrEqual(containerBox.y - 1);
  expect(itemBox.x + itemBox.width).toBeLessThanOrEqual(
    containerBox.x + containerBox.width + 1,
  );
  expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(
    containerBox.y + containerBox.height + 1,
  );
}

/** Navigates to settings. */
export async function navigateToSettings(page: AppPage) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="app-shell-layout"]')),
  );
  await dispatchPrimaryShortcut(page, ',');
  await expect(page.getByTestId('settings-view')).toBeVisible();
}

/** Navigates to workflow. */
export async function navigateToWorkflow(page: AppPage) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="app-shell-layout"]')),
  );
  if (await page.getByTestId('workflow-board').count()) {
    await expect(page.getByTestId('workflow-board')).toBeVisible();
    return;
  }

  if (await page.getByRole('heading', { name: 'No projects yet' }).count()) {
    await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
    return;
  }

  await dispatchPrimaryShortcut(page, 'k');
  await expect(
    page.getByPlaceholder('Search titles, briefs, and work products…'),
  ).toBeVisible();
  await page.getByText('Project board', { exact: true }).click();

  if (await page.getByTestId('workflow-board').count()) {
    await expect(page.getByTestId('workflow-board')).toBeVisible();
    return;
  }

  await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
}

/** Creates project. */
export async function createProject(
  page: AppPage,
  input: {
    description: string;
    name: string;
  },
) {
  const emptyStateButton = page.getByRole('button', { name: /^New project$/i });

  if (await emptyStateButton.count()) {
    await emptyStateButton.click();
  } else {
    await page.getByLabel('Create project').click();
  }

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Project name')).toBeVisible();
  await dialog.getByLabel('Project name').fill(input.name);
  await dialog.getByLabel('Description').fill(input.description);
  const createProjectButton = dialog.getByRole('button', { name: /^Create project$/i });
  await expect(createProjectButton).toBeEnabled();
  await createProjectButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('workflow-board')).toBeVisible();
}

/** Clicks settings nav. */
export async function clickSettingsNav(page: Awaited<ReturnType<ElectronApp['firstWindow']>>, sectionTitle: string) {
  await page.getByTestId('settings-nav').getByText(sectionTitle, { exact: true }).click();
}

/** Navigates to models. */
export async function navigateToModels(page: Awaited<ReturnType<ElectronApp['firstWindow']>>) {
  await navigateToSettings(page);
  await clickSettingsNav(page, 'Models');
  await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();
}

/** Adds provider. */
export async function addProvider(
  page: Awaited<ReturnType<ElectronApp['firstWindow']>>,
  input: {
    authType?: 'api-key' | 'oauth-token';
    baseUrl?: string;
    name: string;
    secret: string;
  },
) {
  const addBtn = page.getByRole('button', { name: /Add provider/i });
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  await expect(page.getByPlaceholder('Provider name')).toBeVisible();
  await page.getByPlaceholder('Provider name').fill(input.name);

  if (input.authType === 'oauth-token') {
    await page.getByLabel('Auth type').selectOption('oauth-token');
    await page.getByPlaceholder('Claude Code OAuth token').fill(input.secret);
  } else {
    await page.getByLabel('Auth type').selectOption('api-key');
    await page.getByPlaceholder('Base URL').fill(input.baseUrl ?? '');
    await page.getByPlaceholder('API key').fill(input.secret);
  }

  await page.getByRole('button', { name: /^Save$/i }).click();
  await expect(page.locator('[data-testid^="provider-card"]', { hasText: input.name })).toBeVisible();
}

/** Toggles default provider. */
export async function toggleDefaultProvider(
  page: Awaited<ReturnType<ElectronApp['firstWindow']>>,
  name: string,
) {
  await providerCard(page, name).getByRole('switch', { name: `Default provider ${name}` }).click();
}

/** Restarts dialog. */
export function restartDialog(page: Awaited<ReturnType<ElectronApp['firstWindow']>>) {
  return page.getByRole('dialog', { name: 'Restart to enable the new default model' });
}

/** Cancels restart dialog. */
export async function cancelRestartDialog(
  page: Awaited<ReturnType<ElectronApp['firstWindow']>>,
) {
  const dialog = restartDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
}

/** Adds workflow item. */
export async function addWorkflowItem(
  page: AppPage,
  title: string,
  brief: string,
) {
  await dispatchPrimaryShortcut(page, 'n');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Work item title')).toBeVisible();
  await dialog.getByLabel('Work item title').fill(title);
  await dialog.getByLabel('Brief').fill(brief);
  await dialog
    .getByRole('button', { name: /^Create work item$/i })
    .evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
  await expect(page.locator(`input[value="${title}"]`).first()).toBeVisible();
}

/** Provides card. */
export function providerCard(page: Awaited<ReturnType<ElectronApp['firstWindow']>>, name: string) {
  return page.locator('[data-testid^="provider-card"]', { hasText: name });
}

/** Closes Electron app. */
export async function closeElectronApp(app: ElectronApp) {
  const child = app.process();
  const closePromise = app.close().catch(() => undefined);
  const closeTimeout = new Promise<void>((resolve) => {
    setTimeout(resolve, 5_000);
  });

  await Promise.race([closePromise, closeTimeout]);

  if (child && child.exitCode === null && !child.killed) {
    if (process.platform === 'win32') {
      child.kill();
    } else {
      child.kill('SIGKILL');
    }

    await Promise.race([
      once(child, 'exit').then(() => undefined),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 2_000);
      }),
    ]);
  }
}
