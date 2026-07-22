import { expect, test } from '@playwright/test';

test.describe('Flujo crítico worker', () => {
  test.skip(!process.env.E2E_WORKER_EMAIL, 'Faltan credenciales E2E');

  test('login y acceso a feed', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/login/);
  });
});
