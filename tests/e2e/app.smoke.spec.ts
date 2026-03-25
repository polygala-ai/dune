import path from 'node:path';

import { _electron as electron } from 'playwright';
import {
  expect,
  test,
  type Locator,
} from '@playwright/test';

async function resizeWindow(
  app: Awaited<ReturnType<typeof electron.launch>>,
  width: number,
  height: number,
) {
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

async function expectRightEdgeWithin(container: Locator, item: Locator) {
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

test('launches the built app, creates an agent, reflows responsively, and keeps overflow contained', async () => {
  const appRoot = path.resolve(__dirname, '../../');
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
  });
  const page = await app.firstWindow();

  await expect(page.getByRole('heading', { name: 'No agents yet.' })).toBeVisible();
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]'),
  ).toHaveCount(1);

  await page.getByRole('button', { name: /^New agent$/i }).first().click();
  await expect(page.getByRole('button', { name: /Channel: Dune chat/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Select Telegram/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Channel: Dune chat/i }).click();
  await expect(page.getByTestId('channel-select-popover')).toBeVisible();
  await expect(page.getByRole('button', { name: /Select Telegram/i })).toBeDisabled();
  await page.getByRole('button', { name: /Open Channels settings/i }).click();
  await expect(page.getByRole('heading', { name: 'External channel catalog' })).toBeVisible();

  await page.keyboard.press(`${modifier}+N`);
  await expect(page.getByRole('button', { name: /Channel: Dune chat/i })).toBeVisible();
  const agentNameInput = page.getByLabel('Agent name');
  await agentNameInput.fill('Navigator');
  await agentNameInput.press('Enter');

  await expect(page.getByRole('heading', { name: 'Navigator' })).toBeVisible();
  await expect(page.getByText('Dune chat')).toBeVisible();
  await expect(page.getByLabel('Agent composer')).toBeVisible();

  const sidebar = page.locator('[data-testid="app-sidebar"]:visible');
  const activeAgent = sidebar.locator('button[aria-current="true"]').first();
  const resizeHandle = page.getByRole('separator', { name: 'Resize sidebar' });

  await resizeWindow(app, 1560, 920);
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId('compact-shell-toolbar')).toHaveCount(0);
  await expect(page.getByTestId('context-panel')).toHaveCount(0);
  await expectRightEdgeWithin(sidebar, activeAgent);

  await resizeHandle.focus();
  await page.keyboard.press('Home');
  await expect(resizeHandle).toHaveAttribute('aria-valuenow', '208');
  await expectRightEdgeWithin(sidebar, activeAgent);

  await resizeWindow(app, 1360, 920);
  await page.keyboard.press(`${modifier}+\\`);
  await expect(page.getByLabel('Close context panel backdrop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('context-panel')).toHaveCount(0);

  await resizeWindow(app, 1040, 820);
  await expect(page.getByTestId('compact-shell-toolbar')).toBeVisible();
  await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: /open sidebar/i }).click();
  await expect(page.getByTestId('app-sidebar')).toBeVisible();
  await page.getByRole('button', { name: /navigator/i }).click();
  await expect(page.getByRole('heading', { name: 'Navigator' })).toBeVisible();
  await expect(page.getByTestId('app-sidebar')).toHaveCount(0);

  const tallMessage = Array.from(
    { length: 180 },
    (_, index) => `line ${index} keeps the transcript busy`,
  ).join('\n');
  await page.getByLabel('Agent composer').fill(tallMessage);
  await page.getByRole('button', { name: /^Send$/i }).click();
  await page.waitForTimeout(300);

  const tallMetrics = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(tallMetrics.scrollHeight).toBeLessThanOrEqual(tallMetrics.innerHeight + 1);
  expect(tallMetrics.scrollWidth).toBeLessThanOrEqual(tallMetrics.innerWidth + 1);

  const longToken = 'x'.repeat(1400);
  await page.getByLabel('Agent composer').fill(longToken);
  await page.getByRole('button', { name: /^Send$/i }).click();
  await page.waitForTimeout(300);

  const wideMetrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(wideMetrics.scrollWidth).toBeLessThanOrEqual(wideMetrics.innerWidth + 1);

  await page.keyboard.press(`${modifier}+,`);
  await expect(page.getByTestId('settings-view')).toBeVisible();
  await page.getByRole('button', { name: /Channels/i }).click();
  await expect(page.getByRole('heading', { name: 'External channel catalog' })).toBeVisible();
  await page.keyboard.press(`${modifier}+K`);
  await expect(
    page.getByPlaceholder('Jump to an agent or action…'),
  ).toBeVisible();

  await app.close();
});
