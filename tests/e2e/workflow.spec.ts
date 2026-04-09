import { expect, test } from '@playwright/test';

import {
  addWorkflowItem,
  cleanupTempHome,
  closeElectronApp,
  createProject,
  createTempHome,
  dispatchPrimaryShortcut,
  launchApp,
  navigateToWorkflow,
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
