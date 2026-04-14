// App smoke end-to-end coverage.

import { expect, test, type Page } from '@playwright/test';

import {
  cleanupTempHome,
  closeElectronApp,
  createProject,
  createTempHome,
  dispatchPrimaryShortcut,
  dispatchWindowKey,
  expectRightEdgeWithin,
  launchApp,
  readDesktopRuntimeChunk,
  seedAgentAttachment,
  seedAgentStore,
  seedWorkflowStore,
  resizeWindow,
} from './helpers';

/** Returns agent open button. */
function getAgentOpenButton(page: Page, agentName: string) {
  return page
    .getByText(agentName, { exact: true })
    .locator('xpath=ancestor::div[.//button[normalize-space()="Open agent"]][1]')
    .getByRole('button', { name: /^Open agent$/i });
}

/** Asserts agent title. */
async function expectAgentTitle(page: Page, agentName: string) {
  if (process.platform === 'darwin') {
    await expect(page.getByTestId('titlebar-agent-title')).toContainText(agentName);
    return;
  }

  await expect(page.getByRole('heading', { name: agentName })).toBeVisible();
}

test('launches the built app, creates an agent, reflows responsively, and keeps overflow contained', async () => {
  const runtimeHome = createTempHome();
  const desktopRuntimeChunk = readDesktopRuntimeChunk();
  const app = await launchApp(runtimeHome);
  try {
    expect(desktopRuntimeChunk).not.toContain('pino-pretty');
    expect(desktopRuntimeChunk).not.toContain('thread-stream-worker');

    const page = await app.firstWindow();

    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-testid="app-shell-layout"]')),
    );
    await expect(page.getByText('No projects yet', { exact: true })).toBeVisible();
    await expect(
      page.locator('meta[http-equiv="Content-Security-Policy"]'),
    ).toHaveCount(1);

    await createProject(page, {
      description: 'Coordinate the first-run workflow shell.',
      name: 'Research Platform',
    });

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
    await expect(page.getByRole('button', { name: /Select Telegram/i })).toBeEnabled();
    await page.getByRole('button', { name: /Select Telegram/i }).click();
    await expect(page.getByRole('heading', { name: 'Telegram setup' })).toBeVisible();
    await page.getByRole('button', { name: /I already have a token/i }).click();
    await expect(page.getByLabel('Bot token')).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$/i }).click();

    await page.getByRole('tab', { name: /^Agents$/i }).click();
    await page.getByRole('button', { name: /^New agent$/i }).click();
    await expect(page.getByRole('button', { name: /Channel: Dune chat/i })).toBeVisible();
    const agentNameInput = page.getByLabel('Agent name');
    await agentNameInput.fill('Navigator');
    await agentNameInput.press('Enter');

    await expect(page.getByLabel('Agent composer')).toBeVisible();

    const sidebar = page.locator('[data-testid="app-sidebar"]:visible');
    const selectedProjectRow = sidebar.locator('button[aria-current="true"]').first();
    const resizeHandle = page.getByRole('separator', { name: 'Resize sidebar' });

    await resizeWindow(app, 1560, 920);
    if (process.platform === 'darwin') {
      await expect(page.getByTestId('titlebar-sidebar-toggle')).toBeVisible();
      await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
      await expect(page.getByTestId('compact-shell-toolbar')).toHaveCount(0);
      await expect(page.getByTestId('context-panel')).toHaveCount(0);
    } else {
      await page.waitForFunction(() => window.innerWidth >= 1240);
      await expect(sidebar).toBeVisible();
      await expect(page.getByTestId('compact-shell-toolbar')).toHaveCount(0);
      await expect(page.getByTestId('context-panel')).toHaveCount(0);
      await expectRightEdgeWithin(sidebar, selectedProjectRow);
    }
    if (process.platform === 'darwin') {
      await page.getByRole('button', { name: /open sidebar/i }).click();
      await page.getByRole('dialog', { name: 'App sidebar' }).getByRole('button', { name: /^Plugins$/i }).click();
    } else {
      await page.getByRole('button', { name: /^Plugins$/i }).click();
    }
    await expect(
      page.getByRole('heading', { name: 'Plugins', exact: true }),
    ).toBeVisible();
    if (process.platform === 'darwin') {
      await page.getByRole('button', { name: /open sidebar/i }).click();
      await page
        .getByRole('dialog', { name: 'App sidebar' })
        .getByRole('button', { name: /^Research Platform$/i })
        .click();
    } else {
      await page.getByRole('button', { name: /^Research Platform$/i }).click();
    }
    await expect(page.getByTestId('workflow-board')).toBeVisible();
    await page.getByRole('tab', { name: /^Agents$/i }).click();
    await getAgentOpenButton(page, 'Navigator').click();
    await expectAgentTitle(page, 'Navigator');

    if (process.platform !== 'darwin') {
      await resizeHandle.focus();
      await resizeHandle.press('Home');
      await expect(resizeHandle).toHaveAttribute('aria-valuenow', '208');
      await expectRightEdgeWithin(sidebar, selectedProjectRow);
    }

    await resizeWindow(app, 1360, 920);
    await dispatchPrimaryShortcut(page, '\\');
    await expect(page.getByTestId('context-panel-overlay')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Agent inspector' })).toBeVisible();
    await dispatchWindowKey(page, 'Escape');
    await expect(page.getByTestId('context-panel')).toHaveCount(0);

    await resizeWindow(app, 1040, 820);
    if (process.platform === 'darwin') {
      await expect(page.getByTestId('titlebar-sidebar-toggle')).toBeVisible();
      await expect(page.getByTestId('compact-shell-toolbar')).toHaveCount(0);
    } else {
      await page.waitForFunction(() => window.innerWidth < 1240);
      await expect(page.getByTestId('compact-shell-toolbar')).toBeVisible();
    }
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
    await page.getByRole('button', { name: /open sidebar/i }).click();
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await page
      .getByRole('dialog', { name: 'App sidebar' })
      .getByRole('button', { name: /close sidebar/i })
      .click();
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
    await expectAgentTitle(page, 'Navigator');
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
    await page.getByRole('button', { name: /Models/i }).click();
    await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();
    await dispatchPrimaryShortcut(page, 'k');
    await expect(
      page.getByPlaceholder('Jump to a project, work item, agent, or action…'),
    ).toBeVisible();
  } finally {
    await closeElectronApp(app);
    cleanupTempHome(runtimeHome);
  }
});

test('renders persisted markdown transcripts with local attachments', async () => {
  const seededHome = createTempHome();
  const seededAgentId = 'dune:agent:seeded-navigator';
  const seededGroupFolder = 'navigator-seeded1234';
  const seededProjectId = 'project-1';

  seedAgentAttachment(seededHome, {
    content: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+p2fQAAAAASUVORK5CYII=',
      'base64',
    ),
    fileName: 'preview.png',
    groupFolder: seededGroupFolder,
  });
  seedAgentAttachment(seededHome, {
    content: 'Release checklist attachment',
    fileName: 'report.txt',
    groupFolder: seededGroupFolder,
  });
  seedAgentStore(seededHome, {
    agents: [
      {
        agent: {
          channel: {
            canCompose: true,
            id: 'dune-chat',
            kind: 'built-in',
            label: 'Dune chat',
            status: 'ready',
          },
          contextCards: [],
          id: seededAgentId,
          messages: [
            {
              attachments: [
                '/workspace/group/attachments/preview.png',
                '/workspace/group/attachments/report.txt',
              ],
              content: [
                '# Launch Checklist',
                '',
                'See [docs](https://example.com/docs).',
                '',
                '- Verify markdown rendering',
                '- Verify attachment rails',
              ].join('\n'),
              createdAt: Date.parse('2026-04-08T10:00:00.000Z'),
              format: 'markdown',
              id: 'message-seeded-1',
              role: 'assistant',
              status: 'complete',
            },
          ],
          name: 'Navigator',
          note: 'A durable agent workspace.',
          preview: 'Launch Checklist',
          projectId: seededProjectId,
          role: 'custom',
          status: 'ready',
          telegram: null,
          updatedAt: Date.parse('2026-04-08T10:00:00.000Z'),
          workspace: 'AgentLite agent',
        },
        groupFolder: seededGroupFolder,
      },
    ],
    selectedAgentId: seededAgentId,
  });
  seedWorkflowStore(seededHome, {
    items: [],
    projects: [
      {
        color: '#2563EB',
        createdAt: Date.parse('2026-04-08T09:00:00.000Z'),
        description: 'Smoke-test project for seeded agent rendering.',
        id: seededProjectId,
        name: 'Research Platform',
        updatedAt: Date.parse('2026-04-08T09:00:00.000Z'),
      },
    ],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: seededProjectId,
    selectedProjectView: 'agents',
  });

  const seededApp = await launchApp(seededHome);

  try {
    const page = await seededApp.firstWindow();

    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-testid="app-shell-layout"]')),
    );
    await expect(page.getByRole('tab', { name: /^Agents$/i })).toBeVisible();
    await page.getByRole('tab', { name: /^Agents$/i }).click();
    await expect(getAgentOpenButton(page, 'Navigator')).toBeVisible();
    await getAgentOpenButton(page, 'Navigator').click();

    await expect(page.getByLabel('Agent composer')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Launch Checklist' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'docs' })).toBeVisible();
    await expect(page.getByAltText('preview.png')).toBeVisible();
    await expect(page.getByRole('link', { name: 'report.txt' })).toBeVisible();
  } finally {
    await closeElectronApp(seededApp);
    cleanupTempHome(seededHome);
  }
});
