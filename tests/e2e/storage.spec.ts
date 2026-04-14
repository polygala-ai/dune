// Storage end-to-end coverage.

import { expect, test } from '@playwright/test';

import {
  addProvider,
  cancelRestartDialog,
  cleanupTempHome,
  closeElectronApp,
  createTempHome,
  launchApp,
  navigateToModels,
  providerCard,
  readUserDataJson,
  toggleDefaultProvider,
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
      await addProvider(page, {
        authType: 'api-key',
        baseUrl: 'https://persist.com/v1',
        name: 'Persistent',
        secret: 'sk-persist123',
      });
      await toggleDefaultProvider(page, 'Persistent');
      await cancelRestartDialog(page);
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
      await expect(
        card.getByRole('switch', { name: 'Default provider Persistent' }),
      ).toHaveAttribute('aria-checked', 'true');
    } finally {
      await closeElectronApp(app2);
    }
  });

  test('stores secrets outside settings.json', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToModels(page);
      await addProvider(page, {
        authType: 'oauth-token',
        name: 'Secretive',
        secret: 'oauth-secret-9999',
      });
      await toggleDefaultProvider(page, 'Secretive');
      await cancelRestartDialog(page);
    } finally {
      await closeElectronApp(app);
    }

    const settings = readUserDataJson(runtimeHome, 'settings.json');
    const secrets = readUserDataJson(runtimeHome, 'secrets.json');
    const settingsText = JSON.stringify(settings);
    const secretValues = Object.values(secrets).join(' ');

    expect(settingsText).not.toContain('oauth-secret-9999');
    expect(settingsText).not.toContain('apiKey');
    expect(settingsText).not.toContain('enabled');
    expect(secretValues).toBeTruthy();
  });

  test('deleted providers stay deleted after restart', async () => {
    const app1 = await launchApp(runtimeHome);
    try {
      const page = await app1.firstWindow();
      await navigateToModels(page);
      await addProvider(page, {
        authType: 'api-key',
        baseUrl: 'https://gone.com',
        name: 'Ephemeral',
        secret: 'sk-gone1234',
      });

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
