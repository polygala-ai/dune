import { expect, test } from '@playwright/test';

import {
  addWorkflowItem,
  cleanupTempHome,
  closeElectronApp,
  createTempHome,
  getModifier,
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
    const modifier = getModifier();
    const app1 = await launchApp(runtimeHome);

    try {
      const page = await app1.firstWindow();
      await navigateToWorkflow(page);
      await page.getByTestId('project-actions-button').click();
      await page.getByTestId('configure-project-button').click();
      await page.getByLabel('Project name').fill('Studio Systems');
      await page.getByLabel('Description').fill('Coordinate the calmer workflow shell.');
      await page.getByRole('button', { name: /^Save$/i }).click();
      await expect(page.getByRole('heading', { name: 'Studio Systems' })).toBeVisible();
    } finally {
      await closeElectronApp(app1);
    }

    const app2 = await launchApp(runtimeHome);

    try {
      const page = await app2.firstWindow();
      await navigateToWorkflow(page);
      await expect(page.getByRole('heading', { name: 'Studio Systems' })).toBeVisible();

      await page.keyboard.press(`${modifier}+K`);
      await page.getByText('New agent', { exact: true }).click();
      await page.getByLabel('Agent name').fill('Studio agent');
      await page.getByLabel('Agent name').press('Enter');
      await expect(page.getByRole('heading', { name: 'Studio agent' })).toBeVisible();

      await navigateToWorkflow(page);
      await page.getByTestId('project-actions-button').click();
      await page.getByTestId('configure-project-button').click();
      await page.getByRole('button', { name: /^Delete project$/i }).click();
      await page.getByTestId('confirm-delete-project-button').click();

      await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^New project$/i })).toBeVisible();
    } finally {
      await closeElectronApp(app2);
    }
  });
});
