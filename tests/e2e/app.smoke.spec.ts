import { expect, test } from '@playwright/test';

import {
  cleanupTempHome,
  closeElectronApp,
  createTempHome,
  dispatchPrimaryShortcut,
  dispatchWindowKey,
  expectRightEdgeWithin,
  launchApp,
  readDesktopRuntimeChunk,
  resizeWindow,
} from './helpers';

test('launches the built app, creates an agent, reflows responsively, and keeps overflow contained', async () => {
  const runtimeHome = createTempHome();
  const desktopRuntimeChunk = readDesktopRuntimeChunk();
  const app = await launchApp(runtimeHome);
  try {
    expect(desktopRuntimeChunk).not.toContain('pino-pretty');
    expect(desktopRuntimeChunk).not.toContain('thread-stream-worker');

    const page = await app.firstWindow();

    await expect(page.getByTestId('workflow-board')).toBeVisible();
    await expect(
      page.locator('meta[http-equiv="Content-Security-Policy"]'),
    ).toHaveCount(1);

    await dispatchPrimaryShortcut(page, 'k');
    await expect(
      page.getByPlaceholder('Jump to a project, work item, agent, or action…'),
    ).toBeVisible();
    await page.getByText('New agent', { exact: true }).click();
    await expect(page.getByRole('button', { name: /Channel: Dune chat/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Select Telegram/i })).toHaveCount(0);
    await page.getByRole('button', { name: /Channel: Dune chat/i }).evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    await expect(page.getByTestId('channel-select-popover')).toBeVisible();
    await expect(page.getByRole('button', { name: /Select Telegram/i })).toBeDisabled();
    await page.getByRole('button', { name: /Open Channels settings/i }).click();
    await expect(page.getByRole('heading', { name: 'Channels' })).toBeVisible();

    await dispatchPrimaryShortcut(page, 'n');
    await expect(page.getByRole('button', { name: /Channel: Dune chat/i })).toBeVisible();
    const agentNameInput = page.getByLabel('Agent name');
    await agentNameInput.fill('Navigator');
    await agentNameInput.press('Enter');

    await expect(page.getByRole('heading', { name: 'Navigator' })).toBeVisible();
    await expect(page.getByLabel('Agent composer')).toBeVisible();

    const sidebar = page.locator('[data-testid="app-sidebar"]:visible');
    const selectedProjectRow = sidebar.locator('button[aria-current="true"]').first();
    const resizeHandle = page.getByRole('separator', { name: 'Resize sidebar' });

    await resizeWindow(app, 1560, 920);
    await expect(sidebar).toBeVisible();
    await expect(page.getByTestId('compact-shell-toolbar')).toHaveCount(0);
    await expect(page.getByTestId('context-panel')).toHaveCount(0);
    await expectRightEdgeWithin(sidebar, selectedProjectRow);
    await page.getByRole('button', { name: /^Plugins$/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Plugins', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Research Platform$/i }).click();
    await expect(page.getByTestId('workflow-board')).toBeVisible();
    await page.getByRole('tab', { name: /^Agents$/i }).click();
    await page.getByRole('button', { name: /^Open agent$/i }).click();
    await expect(page.getByRole('heading', { name: 'Navigator' })).toBeVisible();

    await resizeHandle.focus();
    await resizeHandle.press('Home');
    await expect(resizeHandle).toHaveAttribute('aria-valuenow', '208');
    await expectRightEdgeWithin(sidebar, selectedProjectRow);

    await resizeWindow(app, 1360, 920);
    await dispatchPrimaryShortcut(page, '\\');
    await expect(page.getByTestId('context-panel-overlay')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Agent inspector' })).toBeVisible();
    await dispatchWindowKey(page, 'Escape');
    await expect(page.getByTestId('context-panel')).toHaveCount(0);

    await resizeWindow(app, 1040, 820);
    await expect(page.getByTestId('compact-shell-toolbar')).toBeVisible();
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
    await page.getByRole('button', { name: /open sidebar/i }).click();
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await page.getByRole('button', { name: /close sidebar/i }).click();
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Navigator' })).toBeVisible();
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);

    const longToken = 'x'.repeat(1400);
    await page.getByLabel('Agent composer').fill(longToken);

    const wideMetrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(wideMetrics.scrollWidth).toBeLessThanOrEqual(wideMetrics.innerWidth + 1);

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

    await dispatchPrimaryShortcut(page, ',');
    await expect(page.getByTestId('settings-view')).toBeVisible();
    await page.getByRole('button', { name: /Channels/i }).click();
    await expect(page.getByRole('heading', { name: 'Channels' })).toBeVisible();
    await dispatchPrimaryShortcut(page, 'k');
    await expect(
      page.getByPlaceholder('Jump to a project, work item, agent, or action…'),
    ).toBeVisible();
  } finally {
    await closeElectronApp(app);
    cleanupTempHome(runtimeHome);
  }
});
