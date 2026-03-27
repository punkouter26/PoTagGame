import { test, expect } from './fixtures';

/**
 * Mobile portrait smoke-tests (Pixel 5: 393 × 851).
 *
 * Validates that the UI is usable in a narrow viewport:
 *   - No horizontal overflow (no unwanted scroll)
 *   - Key interactive elements are visible and tappable
 *   - Game canvas scales down to fit the viewport width
 */
test.describe('Mobile Portrait — Lobby', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="connection-badge"]')).toBeHidden({
      timeout: 20_000,
    });
  });

  test('page fits viewport width without horizontal scrollbar', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    // Allow up to 1 px rounding difference
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('app title is visible and not clipped', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /PoTagGame/i });
    await expect(heading).toBeVisible();

    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    // Heading must start within the viewport and have positive height
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('name input is visible and operable', async ({ page }) => {
    const input = page.locator('input[placeholder*="name" i]');
    await expect(input).toBeVisible();

    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    // Input must be at least 40 px tall for comfortable touch target
    expect(box!.height).toBeGreaterThanOrEqual(40);
    // Input must not overflow the right edge of the viewport
    const viewportWidth = page.viewportSize()!.width;
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('Join button is visible and has adequate tap target size', async ({ page }) => {
    const joinBtn = page.getByRole('button', { name: /^join$/i });
    await expect(joinBtn).toBeVisible();

    const box = await joinBtn.boundingBox();
    expect(box).not.toBeNull();
    // WCAG 2.5.5 recommends ≥ 44 × 44 px touch targets
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('player can join lobby on mobile and see their name', async ({ page }) => {
    await page.locator('input[placeholder*="name" i]').fill('MobilePlayer');
    await page.getByRole('button', { name: /^join$/i }).click();

    await expect(page.getByText('MobilePlayer')).toBeVisible({ timeout: 10_000 });
  });

  test('Start Game button is operable after joining', async ({ page }) => {
    await page.locator('input[placeholder*="name" i]').fill('MobileStarter');
    await page.getByRole('button', { name: /^join$/i }).click();

    const startBtn = page.getByRole('button', { name: /start game/i });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });

    const box = await startBtn.boundingBox();
    expect(box).not.toBeNull();
    // Button must sit within viewport width
    const viewportWidth = page.viewportSize()!.width;
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('Mobile Portrait — Game Canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="connection-badge"]')).toBeHidden({
      timeout: 20_000,
    });
    await page.locator('input[placeholder*="name" i]').fill('MobileGamer');
    await page.getByRole('button', { name: /^join$/i }).click();
    await expect(page.getByRole('button', { name: /start game/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /start game/i }).click();
  });

  test('canvas is visible and does not overflow viewport width', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const viewportWidth = page.viewportSize()!.width;
    // Canvas must be scaled to fit — its rendered width must not exceed viewport
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('game canvas scales down to fit portrait width', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    const box = await canvas.boundingBox();
    const viewportWidth = page.viewportSize()!.width;
    // Canvas should use most of the available viewport width (≥ 80 %)
    expect(box!.width).toBeGreaterThanOrEqual(viewportWidth * 0.8);
  });

  test('no horizontal overflow after game starts', async ({ page }) => {
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('HUD timer is visible in portrait mode', async ({ page }) => {
    const timer = page.locator('[data-testid="timer"]');
    await expect(timer).toBeVisible({ timeout: 10_000 });

    const box = await timer.boundingBox();
    expect(box).not.toBeNull();
    // Timer must be positioned within the viewport
    const viewportWidth = page.viewportSize()!.width;
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
