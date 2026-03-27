import { test, expect } from './fixtures';
import { Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Multiplayer E2E tests.
 *
 * Each test spins up two isolated BrowserContexts (simulating two separate
 * browser sessions) so both players share the same SignalR hub but have
 * completely independent cookies / storage / WebSocket connections.
 */

/**
 * Joins the lobby from a given page and waits until the SignalR hub confirms
 * the join by showing the player's own name in the list.
 */
async function joinLobby(page: Page, playerName: string): Promise<void> {
  await page.goto('/');
  // Wait for WS connection (ConnectionBadge renders null = hidden when connected)
  await expect(page.locator('[data-testid="connection-badge"]')).toBeHidden({
    timeout: 20_000,
  });
  await page.locator('input[placeholder*="name" i]').fill(playerName);
  await page.getByRole('button', { name: /^join$/i }).click();
  // The server sends LobbyUpdated; the player's own name appears in the list
  await expect(page.getByText(playerName)).toBeVisible({ timeout: 20_000 });
}

/**
 * After both players have joined, wait until page1 can see page2's player name.
 * This confirms the SignalR LobbyUpdated broadcast was received.
 */
async function waitForBothInLobby(p1: Page, p2Name: string): Promise<void> {
  await expect(p1.getByText(p2Name)).toBeVisible({ timeout: 20_000 });
  // Lobby heading "In Lobby" + count span — DOM is: <h2>In Lobby <span>2</span></h2>
  await expect(p1.locator('h2', { hasText: /In Lobby/ })).toContainText('2', {
    timeout: 20_000,
  });
}

test.describe('Two-player multiplayer', () => {
  let ctx1: BrowserContext;
  let ctx2: BrowserContext;
  let p1:   Page;
  let p2:   Page;

  // Reset server state and create two isolated contexts before each test.
  test.beforeEach(async ({ browser, request }: { browser: Browser; request: any }) => {
    const base = process.env['BASE_URL'] ?? 'http://localhost:7001';
    await request.get(`${base}/test/reset`);
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
    await joinLobby(p1, 'Alice');
    await joinLobby(p2, 'Bob');

    // Confirm p1 received the LobbyUpdated broadcast and lobby count is 2.
    await waitForBothInLobby(p1, 'Bob');
    // p2 must also see Alice (cross-player visibility).
    await waitForBothInLobby(p2, 'Alice');
  });

  // ── Test 2: Player 1 starts the game; both reach the canvas ────────────────
  test('player 1 starts the game and both players see the game canvas', async () => {
    await joinLobby(p1, 'Alice');
    await joinLobby(p2, 'Bob');

    // Ensure p1 has received the broadcast so both players are in lobby.
    await waitForBothInLobby(p1, 'Bob');

    // canStart is true for 1+ player; Start Game button should now be visible.
    const startBtn = p1.getByRole('button', { name: /start game/i });
    await expect(startBtn).toBeVisible({ timeout: 15_000 });

    await startBtn.click();

    await expect(p1.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await expect(p2.locator('canvas')).toBeVisible({ timeout: 15_000 });
  });

  // ── Test 3: Game HUD is visible for both players after start ───────────────
  test('both players see the timer and IT badge after game starts', async () => {
    await joinLobby(p1, 'Alice');
    await joinLobby(p2, 'Bob');
    await waitForBothInLobby(p1, 'Bob');

    await p1.getByRole('button', { name: /start game/i }).click();

    await expect(p1.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await expect(p2.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await expect(p1.locator('[data-testid="timer"]')).toBeVisible({ timeout: 15_000 });
    await expect(p2.locator('[data-testid="timer"]')).toBeVisible({ timeout: 15_000 });

    await expect(p1.locator('[data-testid="it-badge"]')).toBeVisible({ timeout: 15_000 });
    await expect(p2.locator('[data-testid="it-badge"]')).toBeVisible({ timeout: 15_000 });

    // Timer should be a sensible value.
    const timerText = await p1.locator('[data-testid="timer"]').textContent();
    const secs = parseInt(timerText ?? '0', 10);
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(120);
  });
});
