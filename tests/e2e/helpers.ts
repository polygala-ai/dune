import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron } from 'playwright';
import { expect, type Locator } from '@playwright/test';

export type ElectronApp = Awaited<ReturnType<typeof electron.launch>>;

export function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-e2e-home-'));
}

export function cleanupTempHome(dir: string) {
  fs.rmSync(dir, { force: true, recursive: true });
}

export async function launchApp(runtimeHome: string): Promise<ElectronApp> {
  const appRoot = path.resolve(__dirname, '../../');
  const userDataDir = path.join(runtimeHome, 'userdata');
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

export function getModifier() {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

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

export async function navigateToSettings(page: Awaited<ReturnType<ElectronApp['firstWindow']>>) {
  const modifier = getModifier();
  await expect(page.getByTestId('app-shell-layout')).toBeVisible();
  await page.keyboard.press(`${modifier}+,`);
  await expect(page.getByTestId('settings-view')).toBeVisible();
}

export async function clickSettingsNav(page: Awaited<ReturnType<ElectronApp['firstWindow']>>, sectionTitle: string) {
  await page.getByTestId('settings-nav').getByText(sectionTitle, { exact: true }).click();
}

export async function navigateToModels(page: Awaited<ReturnType<ElectronApp['firstWindow']>>) {
  await navigateToSettings(page);
  await clickSettingsNav(page, 'Models');
  await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();
}

export async function addProvider(page: Awaited<ReturnType<ElectronApp['firstWindow']>>, name: string, baseUrl: string, apiKey: string) {
  const addBtn = page.getByRole('button', { name: /Add provider/i });
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  await expect(page.getByPlaceholder('Provider name')).toBeVisible();
  await page.getByPlaceholder('Provider name').fill(name);
  await page.getByPlaceholder('Base URL').fill(baseUrl);
  await page.getByPlaceholder('API key').fill(apiKey);

  await page.getByRole('button', { name: /^Save$/i }).click();
  await expect(page.locator('[data-testid^="provider-card"]', { hasText: name })).toBeVisible();
}

export function providerCard(page: Awaited<ReturnType<ElectronApp['firstWindow']>>, name: string) {
  return page.locator('[data-testid^="provider-card"]', { hasText: name });
}

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
