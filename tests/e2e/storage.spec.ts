import { expect, test } from '@playwright/test';

import {
  addProvider,
  cleanupTempHome,
  closeElectronApp,
  createTempHome,
  launchApp,
  navigateToModels,
  providerCard,
} from './helpers';

test.describe('Storage persistence', () => {
  let runtimeHome: string;

  test.beforeEach(() => {
    runtimeHome = createTempHome();
  });

  test.afterEach(() => {
    cleanupTempHome(runtimeHome);
  });

  test('model providers persist across app restarts', async () => {
    const app1 = await launchApp(runtimeHome);
    try {
      const page = await app1.firstWindow();
      await navigateToModels(page);
      await addProvider(page, 'Persistent', 'https://persist.com/v1', 'sk-persist123');
    } finally {
      await closeElectronApp(app1);
    }

    const app2 = await launchApp(runtimeHome);
    try {
      const page = await app2.firstWindow();
      await navigateToModels(page);

      const card = providerCard(page, 'Persistent');
      await expect(card).toBeVisible();
      await expect(card.getByText('https://persist.com/v1')).toBeVisible();
    } finally {
      await closeElectronApp(app2);
    }
  });

  test('deleted providers stay deleted after restart', async () => {
    const app1 = await launchApp(runtimeHome);
    try {
      const page = await app1.firstWindow();
      await navigateToModels(page);
      await addProvider(page, 'Ephemeral', 'https://gone.com', 'sk-gone1234');

      await page.getByLabel('Remove Ephemeral').click();
      await expect(providerCard(page, 'Ephemeral')).not.toBeVisible();
    } finally {
      await closeElectronApp(app1);
    }

    const app2 = await launchApp(runtimeHome);
    try {
      const page = await app2.firstWindow();
      await navigateToModels(page);
      await expect(providerCard(page, 'Ephemeral')).not.toBeVisible();
    } finally {
      await closeElectronApp(app2);
    }
  });
});
