import { expect, test } from '@playwright/test';

test.describe('Landing pública', () => {
  test('muestra hero y CTAs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Bee a Worker.')).toBeVisible();
  });

  test('navega a registro', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Registro' }).first().click();
    await expect(page).toHaveURL(/register/);
  });
});
