import { expect, test } from '@playwright/test';

import {
  addProvider,
  cancelRestartDialog,
  cleanupTempHome,
  clickSettingsNav,
  closeElectronApp,
  createTempHome,
  launchApp,
  navigateToModels,
  navigateToSettings,
  providerCard,
  restartDialog,
  toggleDefaultProvider,
} from './helpers';

test.describe('Settings', () => {
  let runtimeHome: string;

  test.beforeEach(() => {
    runtimeHome = createTempHome();
  });

  test.afterEach(() => {
    cleanupTempHome(runtimeHome);
  });

  test('navigates between all settings sections', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToSettings(page);

      await clickSettingsNav(page, 'Appearance');
      await expect(page.getByRole('heading', { name: 'Visual tone' })).toBeVisible();

      await clickSettingsNav(page, 'Network');
      await expect(page.getByRole('heading', { name: 'Proxy and transport' })).toBeVisible();

      await clickSettingsNav(page, 'Models');
      await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();

      await clickSettingsNav(page, 'Shortcuts');
      await expect(page.getByRole('heading', { name: 'Keyboard-first reference' })).toBeVisible();

      await clickSettingsNav(page, 'Nuclear');
      await expect(page.getByRole('heading', { name: 'Factory reset' })).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('adds a model provider', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToModels(page);
      await addProvider(page, {
        authType: 'api-key',
        baseUrl: 'https://api.openai.com/v1',
        name: 'OpenAI',
        secret: 'sk-test-12345678',
      });

      const card = providerCard(page, 'OpenAI');
      await expect(card.getByText('https://api.openai.com/v1')).toBeVisible();
      await expect(card.getByText('sk-t...5678')).toBeVisible();
      await expect(card.getByText('API key')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('adds an oauth-token provider', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToModels(page);
      await addProvider(page, {
        authType: 'oauth-token',
        name: 'Claude Code',
        secret: 'oauth-token-1234',
      });

      const card = providerCard(page, 'Claude Code');
      await expect(card.getByText('OAuth token')).toBeVisible();
      await expect(card.getByText('oaut...1234')).toBeVisible();
      await expect(card.getByText('https://')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('toggles the default provider and keeps it exclusive', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToModels(page);
      await addProvider(page, {
        authType: 'api-key',
        baseUrl: 'https://first.com',
        name: 'First',
        secret: 'sk-first-1234',
      });
      await addProvider(page, {
        authType: 'oauth-token',
        name: 'Second',
        secret: 'oauth-second-1234',
      });

      await toggleDefaultProvider(page, 'First');
      await expect(restartDialog(page)).toBeVisible();
      await expect(restartDialog(page).getByRole('button', { name: 'Restart' })).toBeVisible();
      await expect(restartDialog(page).getByRole('button', { name: 'Cancel' })).toBeVisible();
      await cancelRestartDialog(page);
      await expect(
        providerCard(page, 'First').getByRole('switch', { name: 'Default provider First' }),
      ).toHaveAttribute('aria-checked', 'true');
      await expect(
        providerCard(page, 'Second').getByRole('switch', { name: 'Default provider Second' }),
      ).toHaveAttribute('aria-checked', 'false');

      await toggleDefaultProvider(page, 'Second');
      await expect(restartDialog(page)).toBeVisible();
      await cancelRestartDialog(page);
      await expect(
        providerCard(page, 'First').getByRole('switch', { name: 'Default provider First' }),
      ).toHaveAttribute('aria-checked', 'false');
      await expect(
        providerCard(page, 'Second').getByRole('switch', { name: 'Default provider Second' }),
      ).toHaveAttribute('aria-checked', 'true');

      await toggleDefaultProvider(page, 'Second');
      await expect(restartDialog(page)).toBeVisible();
      await cancelRestartDialog(page);
      await expect(
        providerCard(page, 'Second').getByRole('switch', { name: 'Default provider Second' }),
      ).toHaveAttribute('aria-checked', 'false');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('edits a model provider', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToModels(page);
      await addProvider(page, {
        authType: 'api-key',
        baseUrl: 'https://old.com',
        name: 'OldName',
        secret: 'sk-oldkey99',
      });

      const card = providerCard(page, 'OldName');
      await card.getByRole('button', { name: 'Edit' }).click();

      // Wait for edit form
      const nameInput = page.getByPlaceholder('Provider name');
      await expect(nameInput).toBeVisible();
      await nameInput.clear();
      await nameInput.fill('NewName');
      await page.getByRole('button', { name: /^Save$/i }).click();

      await expect(providerCard(page, 'NewName')).toBeVisible();
      await expect(providerCard(page, 'OldName')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('removes a model provider', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToModels(page);
      await addProvider(page, {
        authType: 'api-key',
        baseUrl: 'https://delete.com',
        name: 'ToDelete',
        secret: 'sk-delete99',
      });

      await page.getByLabel('Remove ToDelete').click();
      await expect(providerCard(page, 'ToDelete')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });
});
