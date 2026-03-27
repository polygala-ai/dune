import { expect, test } from '@playwright/test';

import {
  addProvider,
  cleanupTempHome,
  clickSettingsNav,
  closeElectronApp,
  createTempHome,
  launchApp,
  navigateToModels,
  navigateToSettings,
  providerCard,
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

      await clickSettingsNav(page, 'Channels');
      await expect(page.getByRole('heading', { name: 'External channel catalog' })).toBeVisible();

      await clickSettingsNav(page, 'Models');
      await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();

      await clickSettingsNav(page, 'Shortcuts');
      await expect(page.getByRole('heading', { name: 'Keyboard-first reference' })).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('adds a model provider', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToModels(page);
      await addProvider(page, 'OpenAI', 'https://api.openai.com/v1', 'sk-test-12345678');

      const card = providerCard(page, 'OpenAI');
      await expect(card.getByText('https://api.openai.com/v1')).toBeVisible();
      await expect(card.getByText('sk-t...5678')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('toggles a model provider off and on', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToModels(page);
      await addProvider(page, 'ToggleTest', 'https://toggle.com', 'sk-toggle99');

      const card = providerCard(page, 'ToggleTest');
      await expect(card.getByText('On')).toBeVisible();
      await card.getByText('On').click();
      await expect(card.getByText('Off')).toBeVisible();
      await card.getByText('Off').click();
      await expect(card.getByText('On')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('edits a model provider', async () => {
    const app = await launchApp(runtimeHome);
    try {
      const page = await app.firstWindow();
      await navigateToModels(page);
      await addProvider(page, 'OldName', 'https://old.com', 'sk-oldkey99');

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
      await addProvider(page, 'ToDelete', 'https://delete.com', 'sk-delete99');

      await page.getByLabel('Remove ToDelete').click();
      await expect(providerCard(page, 'ToDelete')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });
});
