import { test, expect } from './fixtures';

/**
 * Exploration-based tests generated from live browser exploration.
 * Covers end-to-end user flows discovered during interactive testing.
 */
test.describe('Lobby — Name Entry & Join', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('homepage shows title, subtitle, name input, and join button', async ({ page }) => {
    await test.step('Verify branding and layout', async () => {
      await expect(page.getByRole('heading', { name: /potaggame/i })).toBeVisible();
      await expect(page.getByText('Real-time multiplayer tag')).toBeVisible();
    });

    await test.step('Verify join form elements', async () => {
      await expect(page.locator('input[placeholder*="name" i]')).toBeVisible();
      await expect(page.getByRole('button', { name: /join/i })).toBeVisible();
    });
  });

  test('join button is disabled when name input is empty', async ({ page }) => {
    await test.step('Clear any saved name and verify disabled state', async () => {
      const changeName = page.getByRole('button', { name: /change name/i });
      if (await changeName.isVisible()) {
        await changeName.click();
      }
      const input = page.locator('input[placeholder*="name" i]');
      await input.fill('');
      await expect(page.getByRole('button', { name: /join/i })).toBeDisabled();
    });
  });

  test('joining shows player in lobby list with (you) indicator', async ({ page }) => {
    await test.step('Wait for SignalR connection', async () => {
      await expect(page.locator('[data-testid="connection-badge"]')).toBeHidden({ timeout: 20_000 });
    });

    await test.step('Enter name and join', async () => {
      await page.locator('input[placeholder*="name" i]').fill('ExplorePlayer');
      await page.getByRole('button', { name: /join/i }).click();
    });

    await test.step('Verify player appears in lobby', async () => {
      await expect(page.getByText('ExplorePlayer')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('(you)')).toBeVisible({ timeout: 10_000 });
    });

    await test.step('Verify lobby count badge', async () => {
      await expect(page.getByText('In Lobby')).toBeVisible();
    });
  });

  test('name persists in localStorage after joining and returning', async ({ page }) => {
    await test.step('Join with a name', async () => {
      await expect(page.locator('[data-testid="connection-badge"]')).toBeHidden({ timeout: 20_000 });
      await page.locator('input[placeholder*="name" i]').fill('PersistName');
      await page.getByRole('button', { name: /join/i }).click();
      await expect(page.getByText('PersistName')).toBeVisible({ timeout: 15_000 });
    });

    await test.step('Reload and verify name persisted', async () => {
      await page.reload();
      const input = page.locator('input[placeholder*="name" i]');
      await expect(input).toHaveValue('PersistName');
    });
  });

  test('"not you? change name" clears saved name and resets form', async ({ page }) => {
    await test.step('Join with a saved name', async () => {
      await page.locator('input[placeholder*="name" i]').fill('OldName');
      await page.getByRole('button', { name: /join/i }).click();
    });

    await test.step('Return to lobby and click change name', async () => {
      await page.reload();
      const changeName = page.getByRole('button', { name: /change name/i });
      await expect(changeName).toBeVisible();
      await changeName.click();
    });

    await test.step('Verify name is cleared and join is disabled', async () => {
      const input = page.locator('input[placeholder*="name" i]');
      await expect(input).toHaveValue('');
      await expect(page.getByRole('button', { name: /join/i })).toBeDisabled();
      await expect(page.getByRole('button', { name: /change name/i })).not.toBeVisible();
    });
  });
});

test.describe('Lobby — Arena Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="connection-badge"]')).toBeHidden({ timeout: 15_000 });
    await page.locator('input[placeholder*="name" i]').fill('ArenaTester');
    await page.getByRole('button', { name: /join/i }).click();
    await expect(page.getByRole('button', { name: /start game/i })).toBeVisible({ timeout: 10_000 });
  });

  test('arena dropdown shows all options — Grassland, Dungeon, Rooftop', async ({ page }) => {
    await test.step('Verify default selection', async () => {
      const select = page.locator('select');
      await expect(select).toBeVisible();
      await expect(select).toHaveValue('grassland');
    });

    await test.step('Verify all arena options exist', async () => {
      const options = page.locator('select option');
      await expect(options).toHaveCount(3);
      await expect(options.nth(0)).toHaveText('Grassland');
      await expect(options.nth(1)).toHaveText('Dungeon');
      await expect(options.nth(2)).toHaveText('Rooftop');
    });
  });

  test('can switch arena selection', async ({ page }) => {
    await test.step('Select Dungeon', async () => {
      await page.locator('select').selectOption('dungeon');
      await expect(page.locator('select')).toHaveValue('dungeon');
    });

    await test.step('Select Rooftop', async () => {
      await page.locator('select').selectOption('rooftop');
      await expect(page.locator('select')).toHaveValue('rooftop');
    });
  });
});

test.describe('Lobby — Invite Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="connection-badge"]')).toBeHidden({ timeout: 15_000 });
    await page.locator('input[placeholder*="name" i]').fill('InviteTester');
    await page.getByRole('button', { name: /join/i }).click();
    await expect(page.getByRole('button', { name: /start game/i })).toBeVisible({ timeout: 10_000 });
  });

  test('Copy Link and Messenger buttons are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /messenger/i })).toBeVisible();
  });

  test('Copy Link button shows "Copied!" feedback on click', async ({ page }) => {
    await test.step('Click copy link', async () => {
      await page.context().grantPermissions(['clipboard-write']);
      await page.getByRole('button', { name: /copy link/i }).click();
    });

    await test.step('Verify copied feedback', async () => {
      await expect(page.getByRole('button', { name: /copied/i })).toBeVisible();
    });
  });

  test('Messenger link points to Facebook dialog with current URL', async ({ page }) => {
    const messengerLink = page.getByRole('link', { name: /messenger/i });
    const href = await messengerLink.getAttribute('href');
    expect(href).toContain('facebook.com/dialog/send');
    // Link should encode the current page URL, not a hard-coded hostname
    const pageHost = encodeURIComponent(new URL(page.url()).hostname);
    expect(href).toContain(pageHost);
  });
});

test.describe('Game — Start and Canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="connection-badge"]')).toBeHidden({ timeout: 15_000 });
    await page.locator('input[placeholder*="name" i]').fill('GameTester');
    await page.getByRole('button', { name: /join/i }).click();
    const startBtn = page.getByRole('button', { name: /start game/i });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();
  });

  test('game canvas and HUD appear after starting', async ({ page }) => {
    await test.step('Canvas is rendered', async () => {
      await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Timer is visible', async () => {
      const timer = page.locator('[data-testid="timer"]');
      await expect(timer).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Round indicator is visible', async () => {
      await expect(page.getByText(/Rd \d+\/\d+/)).toBeVisible();
    });

    await test.step('IT badge is displayed', async () => {
      await expect(page.locator('[data-testid="it-badge"]')).toBeVisible({ timeout: 5_000 });
    });
  });

  test('WASD keyboard input does not crash the game', async ({ page }) => {
    await test.step('Send WASD keys', async () => {
      const canvas = page.locator('canvas');
      await canvas.focus();
      await page.keyboard.press('KeyW');
      await page.keyboard.press('KeyA');
      await page.keyboard.press('KeyS');
      await page.keyboard.press('KeyD');
      await page.keyboard.press('Space');
    });

    await test.step('Canvas still visible after input', async () => {
      await expect(page.locator('canvas')).toBeVisible();
    });
  });
});

test.describe('Game — Leave and Return to Lobby', () => {
  test('leave game button returns to lobby screen', async ({ page }) => {
    await test.step('Join and start game', async () => {
      await page.goto('/');
      await expect(page.locator('[data-testid="connection-badge"]')).toBeHidden({ timeout: 15_000 });
      await page.locator('input[placeholder*="name" i]').fill('LeaveTester');
      await page.getByRole('button', { name: /join/i }).click();
      const startBtn = page.getByRole('button', { name: /start game/i });
      await expect(startBtn).toBeVisible({ timeout: 10_000 });
      await startBtn.click();
      await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Click leave game', async () => {
      const leaveBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
      await leaveBtn.click({ force: true });
    });

    await test.step('Verify lobby is shown again', async () => {
      await expect(page.locator('input[placeholder*="name" i]').or(page.getByRole('button', { name: /change name/i }))).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { name: /potaggame/i })).toBeVisible();
    });

    await test.step('Name is preserved after leaving', async () => {
      const nameInput = page.locator('input[placeholder*="name" i]');
      if (await nameInput.isVisible()) {
        await expect(nameInput).toHaveValue('LeaveTester');
      }
    });
  });
});
