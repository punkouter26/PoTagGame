import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Multiplayer E2E tests.
 *
 * Each test spins up two isolated BrowserContexts (simulating two separate
 * browser sessions) so both players share the same SignalR hub but have
 * completely independent cookies / storage / WebSocket connections.
 */

/** Joins the lobby from a given page and waits until the player list contains the name. */
async function joinLobby(page: Page, playerName: string): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-testid="connection-badge"]')).toContainText(/connected/i, {
    timeout: 15_000,
  });
  await page.locator('input[placeholder*="name" i]').fill(playerName);
  await page.getByRole('button', { name: /^join$/i }).click();
  // The player's own name appears in the player list
  await expect(page.getByText(playerName)).toBeVisible({ timeout: 10_000 });
}

test.describe('Two-player multiplayer', () => {
  let ctx1: BrowserContext;
  let ctx2: BrowserContext;
  let p1:   Page;
  let p2:   Page;

  // Create two isolated contexts before each test and navigate both to the app.
  test.beforeEach(async ({ browser }: { browser: Browser }) => {
    ctx1 = await browser.newContext();
    ctx2 = await browser.newContext();
    p1   = await ctx1.newPage();
    p2   = await ctx2.newPage();
  });

  // Always clean up contexts to avoid leaking connections.
  test.afterEach(async () => {
    await ctx1.close();
    await ctx2.close();
  });

  // ── Test 1: Both players join the lobby ─────────────────────────────────────
  test('two players join the lobby and see each other in the player list', async () => {
    // Player 1 joins first.
    await joinLobby(p1, 'Alice');

    // Player 2 joins from a separate context.
    await joinLobby(p2, 'Bob');

    // Each player's view should eventually show BOTH names in the lobby list
    // (the server broadcasts LobbyUpdated to all connected clients).
    await expect(p1.getByText('Alice')).toBeVisible({ timeout: 10_000 });
    await expect(p1.getByText('Bob')).toBeVisible({ timeout: 10_000 });

    await expect(p2.getByText('Alice')).toBeVisible({ timeout: 10_000 });
    await expect(p2.getByText('Bob')).toBeVisible({ timeout: 10_000 });

    // Lobby heading should reflect 2 players.
    await expect(p1.getByText(/In Lobby \(2\)/i)).toBeVisible({ timeout: 10_000 });
    await expect(p2.getByText(/In Lobby \(2\)/i)).toBeVisible({ timeout: 10_000 });
  });

  // ── Test 2: Player 1 starts the game; both reach the canvas ────────────────
  test('player 1 starts the game and both players see the game canvas', async () => {
    // Both players join.
    await joinLobby(p1, 'Alice');
    await joinLobby(p2, 'Bob');

    // Wait until Alice's view shows a Start Game button (canStart == true).
    const startBtn = p1.getByRole('button', { name: /start game/i });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });

    // Alice starts the game.
    await startBtn.click();

    // Both players should transition to the game canvas.
    await expect(p1.locator('canvas')).toBeVisible({ timeout: 10_000 });
    await expect(p2.locator('canvas')).toBeVisible({ timeout: 10_000 });
  });

  // ── Test 3: Game HUD is visible for both players after start ───────────────
  test('both players see the timer and IT badge after game starts', async () => {
    await joinLobby(p1, 'Alice');
    await joinLobby(p2, 'Bob');

    await p1.getByRole('button', { name: /start game/i }).click();

    // Wait for canvas on both sides first.
    await expect(p1.locator('canvas')).toBeVisible({ timeout: 10_000 });
    await expect(p2.locator('canvas')).toBeVisible({ timeout: 10_000 });

    // HUD elements should be present for both players.
    await expect(p1.locator('[data-testid="timer"]')).toBeVisible({ timeout: 10_000 });
    await expect(p2.locator('[data-testid="timer"]')).toBeVisible({ timeout: 10_000 });

    await expect(p1.locator('[data-testid="it-badge"]')).toBeVisible({ timeout: 10_000 });
    await expect(p2.locator('[data-testid="it-badge"]')).toBeVisible({ timeout: 10_000 });

    // Timer should be a sensible value.
    const timerText = await p1.locator('[data-testid="timer"]').textContent();
    const secs = parseInt(timerText ?? '0', 10);
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(120);
  });
});
