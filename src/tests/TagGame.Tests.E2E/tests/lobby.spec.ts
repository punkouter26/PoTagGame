import { test, expect } from './fixtures';

/**
 * Lobby smoke-tests.
 * Assumes the server is running at BASE_URL (default: http://localhost:7001).
 */
test.describe('Lobby', () => {
  test('page loads with name input and join button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[placeholder*="name" i]')).toBeVisible();
    await expect(page.getByRole('button', { name: /join/i })).toBeVisible();
  });

  test('player can join lobby and see their name in the list', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name" i]').fill('E2EPlayer');
    await page.getByRole('button', { name: /join/i }).click();

    await expect(page.getByText('E2EPlayer')).toBeVisible();
  });

  test('Start Game button appears when a player has joined', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name" i]').fill('Starter');
    await page.getByRole('button', { name: /join/i }).click();

    await expect(page.getByRole('button', { name: /start game/i })).toBeVisible();
  });

  test('connection badge hides when connected (component returns null on success)', async ({ page }) => {
    await page.goto('/');
    // ConnectionBadge renders null when status === 'connected',
    // so a hidden badge proves the WebSocket connection succeeded.
    const badge = page.locator('[data-testid="connection-badge"]');
    await expect(badge).toBeHidden({ timeout: 15_000 });
  });
});
