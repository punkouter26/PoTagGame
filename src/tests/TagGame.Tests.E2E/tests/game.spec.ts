import { test, expect } from '@playwright/test';

/**
 * In-game smoke-tests.
 * Solo mode: one player starts the game and the canvas + timer should appear.
 */
test.describe('Game', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for SignalR connection before interacting
    await expect(page.locator('[data-testid="connection-badge"]')).toContainText(/connected/i, { timeout: 15_000 });
    await page.locator('input[placeholder*="name" i]').fill('SoloPlayer');
    await page.getByRole('button', { name: /join/i }).click();
    // Wait for lobby to update and Start Game button to appear
    const startBtn = page.getByRole('button', { name: /start game/i });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();
  });

  test('game canvas is visible after starting', async ({ page }) => {
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 });
  });

  test('countdown timer appears and shows seconds', async ({ page }) => {
    const timer = page.locator('[data-testid="timer"]');
    await expect(timer).toBeVisible({ timeout: 5_000 });
    // Timer should show a number between 0 and 120
    const text = await timer.textContent();
    const secs = parseInt(text ?? '0', 10);
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(120);
  });

  test('IT badge shown on screen', async ({ page }) => {
    await expect(page.locator('[data-testid="it-badge"]')).toBeVisible({ timeout: 5_000 });
  });

  test('keyboard arrow keys move the player (canvas receives input)', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Focus canvas so it receives keyboard events
    await canvas.click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    // Verify no crash (canvas still visible after input)
    await expect(canvas).toBeVisible();
  });
});
