import { test as base } from '@playwright/test';

const BASE = process.env['BASE_URL'] ?? 'http://localhost:7001';

// Reset game state before each test so the singleton GameService starts clean
export const test = base.extend({
  page: async ({ page, request }, use) => {
    await request.get(`${BASE}/test/reset`);
    await use(page);
  },
});

export { expect } from '@playwright/test';
