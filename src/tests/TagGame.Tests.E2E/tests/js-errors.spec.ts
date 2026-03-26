import { test, expect } from '@playwright/test';

/**
 * JavaScript error detection test.
 * Navigates through the app and captures any console errors.
 */
test.describe('JavaScript Error Detection', () => {
  test('no JS errors during lobby and game flow', async ({ page }) => {
    const jsErrors: string[] = [];
    const warnings: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
      if (msg.type() === 'warning') warnings.push(msg.text());
    });

    page.on('pageerror', (err) => {
      jsErrors.push(err.message);
    });

    // Navigate to app
    await page.goto('/');
    await expect(page.locator('[data-testid="connection-badge"]')).toContainText(/connected/i, { timeout: 15_000 });

    // Join lobby
    await page.locator('input[placeholder*="name" i]').fill('JSCheckPlayer');
    await page.getByRole('button', { name: /join/i }).click();
    await expect(page.getByText('JSCheckPlayer')).toBeVisible({ timeout: 5_000 });

    // Start game
    const startBtn = page.getByRole('button', { name: /start game/i });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();

    // Wait for canvas
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 });

    // Move around
    const canvas = page.locator('canvas');
    await canvas.click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(2000);

    // Report findings
    console.log(`JS Errors found: ${jsErrors.length}`);
    jsErrors.forEach((e) => console.log(`  ERROR: ${e}`));
    console.log(`Warnings found: ${warnings.length}`);

    // Fail if there are uncaught JS errors (exclude known SignalR transient errors)
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('WebSocket') && !e.includes('reconnect') && !e.includes('negotiation') && !e.includes('Failed to start the connection')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
