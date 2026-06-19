import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

const PNG_FIXTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('asset hub media upload posts to /api/uploads and refreshes library', async ({ page, request }) => {
  const fileName = `e2e-hub-upload-${Date.now()}.png`;

  const listBefore = await request.get(`${apiBase}/api/library?category=media&limit=200`);
  expect(listBefore.ok()).toBeTruthy();
  const beforeCount = ((await listBefore.json()) as { items?: unknown[] }).items?.length ?? 0;

  await page.goto('/assets?tab=media');
  await expect(page.getByRole('heading', { name: '资产库' })).toBeVisible();
  await expect(page.getByText('上传素材')).toBeVisible();

  const uploadInput = page.locator('label').filter({ hasText: '上传素材' }).locator('input[type="file"]');

  const [uploadResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/uploads') && response.request().method() === 'POST',
    ),
    uploadInput.setInputFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer: PNG_FIXTURE,
    }),
  ]);

  expect(uploadResponse.ok(), await uploadResponse.text()).toBeTruthy();
  const uploaded = await uploadResponse.json() as { url: string; asset_id?: string };
  expect(uploaded.url).toMatch(/^\/uploads\//);
  expect(uploaded.asset_id).toBeTruthy();

  await expect(page.getByText(fileName).first()).toBeVisible({ timeout: 10_000 });

  const listAfter = await request.get(`${apiBase}/api/library?category=media&limit=200`);
  expect(listAfter.ok()).toBeTruthy();
  const afterItems = ((await listAfter.json()) as { items?: Array<{ id: string; name: string }> }).items ?? [];
  expect(afterItems.length).toBeGreaterThan(beforeCount);
  expect(afterItems.some((item) => item.id === uploaded.asset_id && item.name === fileName)).toBeTruthy();

  const removed = await request.delete(`${apiBase}/api/assets/${uploaded.asset_id}`);
  expect(removed.ok()).toBeTruthy();
});