import { expect, test } from '@playwright/test';

import {
  addWorkflowItem,
  cleanupTempHome,
  closeElectronApp,
  createProject,
  createTempHome,
  dispatchPrimaryShortcut,
  expectBoundingBoxWithin,
  launchApp,
  navigateToWorkflow,
  resizeWindow,
  seedWorkflowStore,
} from './helpers';

test.describe('Workflow persistence', () => {
  let runtimeHome: string;

  test.beforeEach(() => {
    runtimeHome = createTempHome();
  });

  test.afterEach(() => {
    cleanupTempHome(runtimeHome);
  });

  test('project work items persist across app restarts', async () => {
    const app1 = await launchApp(runtimeHome);
    try {
      const page = await app1.firstWindow();
      await navigateToWorkflow(page);
      await createProject(page, {
        description: 'Keep workflow items scoped to a persisted project.',
        name: 'Workflow Studio',
      });
      await addWorkflowItem(
        page,
        'Persisted project work item',
        'Keep this work item card available after restart.',
      );
    } finally {
      await closeElectronApp(app1);
    }

    const app2 = await launchApp(runtimeHome);
    try {
      const page = await app2.firstWindow();
      await navigateToWorkflow(page);
      await expect(
        page.locator('input[value="Persisted project work item"]').first(),
      ).toBeVisible();
    } finally {
      await closeElectronApp(app2);
    }
  });

  test('compact project settings drawer keeps the form and footer visible at minimum window size', async () => {
    const seededProjectId = 'compact-project-settings';

    seedWorkflowStore(runtimeHome, {
      items: [],
      projects: [
        {
          color: '#2563EB',
          createdAt: Date.parse('2026-04-13T08:00:00.000Z'),
          description: 'Coordinate the calmer workflow shell.',
          id: seededProjectId,
          name: 'Workflow Studio',
          rootPath: '/tmp/workflow-studio',
          updatedAt: Date.parse('2026-04-13T08:00:00.000Z'),
        },
      ],
      selectedItemId: null,
      selectedProjectFilter: 'all',
      selectedProjectId: seededProjectId,
      selectedProjectView: 'board',
    });

    const app = await launchApp(runtimeHome);

    try {
      const page = await app.firstWindow();
      await resizeWindow(app, 960, 720);
      await page.waitForFunction(() => window.innerWidth < 1240);

      await navigateToWorkflow(page);
      await page.getByTestId('project-actions-button').click();

      const dialog = page.getByRole('dialog', { name: 'Project settings' });
      const scrollRegion = page.getByTestId('workflow-project-settings-scroll-region');
      const descriptionField = dialog.getByLabel('Description');
      const footer = page.getByTestId('workflow-project-settings-footer');

      await expect(dialog).toBeVisible();
      await expect(scrollRegion).toBeVisible();
      await expectBoundingBoxWithin(dialog, descriptionField);
      await expectBoundingBoxWithin(dialog, footer);

      await scrollRegion.evaluate((node) => {
        const viewport = node.querySelector('[data-radix-scroll-area-viewport]');

        if (!(viewport instanceof HTMLElement)) {
          throw new Error('Workflow project settings scroll viewport was not found.');
        }

        viewport.scrollTop = viewport.scrollHeight;
      });

      const dangerZone = dialog.getByText('Danger zone');
      const deleteButton = dialog.getByRole('button', { name: /^Delete project$/i });

      await expectBoundingBoxWithin(dialog, dangerZone);
      await expectBoundingBoxWithin(dialog, deleteButton);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('project settings persist across restart and deleting the last project falls back to the empty shell', async () => {
    const app1 = await launchApp(runtimeHome);

    try {
      const page = await app1.firstWindow();
      await navigateToWorkflow(page);
      await createProject(page, {
        description: 'Coordinate the calmer workflow shell.',
        name: 'Workflow Studio',
      });
      await page.getByTestId('project-actions-button').click();
      await expect(page.getByTestId('workflow-project-settings-panel')).toBeVisible();
      await page.getByLabel('Project name').fill('Studio Systems');
      await page.getByLabel('Description').fill('Coordinate the calmer workflow shell.');
      await page.getByRole('button', { name: /^Save$/i }).click();
      await expect(page.getByTestId('workflow-board')).toBeVisible();
      await expect(page.getByText('Studio Systems', { exact: true }).first()).toBeVisible();
    } finally {
      await closeElectronApp(app1);
    }

    const app2 = await launchApp(runtimeHome);

    try {
      const page = await app2.firstWindow();
      await navigateToWorkflow(page);
      await expect(page.getByText('Studio Systems', { exact: true }).first()).toBeVisible();

      await dispatchPrimaryShortcut(page, 'k');
      await page.getByText('New agent', { exact: true }).click();
      await page.getByLabel('Agent name').fill('Studio agent');
      await page.getByRole('button', { name: /^Create agent$/i }).click();
      await expect(page.getByLabel('Agent composer')).toBeVisible();

      await navigateToWorkflow(page);
      await page.getByTestId('project-actions-button').click();
      await expect(page.getByTestId('workflow-project-settings-panel')).toBeVisible();
      await page.getByRole('button', { name: /^Delete project$/i }).click();
      await page.getByTestId('confirm-delete-project-button').click();

      await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^New project$/i })).toBeVisible();
    } finally {
      await closeElectronApp(app2);
    }
  });
});
