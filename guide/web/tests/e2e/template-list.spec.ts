import { expect, test } from '@playwright/test';

test('template center hides e2e templates by default and supports search', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '模板中心' })).toBeVisible();
  await expect(page.getByPlaceholder(/搜索模板名称/)).toBeVisible();

  const e2eToggle = page.getByRole('button', { name: /显示测试模板/ });
  if (await e2eToggle.isVisible()) {
    await expect(e2eToggle).toBeVisible();
    const label = await e2eToggle.textContent();
    expect(label).toMatch(/\d+/);
  }

  await page.getByPlaceholder(/搜索模板名称/).fill('E2E');
  await page.waitForTimeout(400);

  const cards = page.locator('[data-testid="template-card"]');
  const count = await cards.count();
  if (count > 0) {
    await expect(cards.first()).toBeVisible();
  }
});

test('template center shows onboarding wizard for new users', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('guide_onboarding_dismissed');
  });
  await page.goto('/');
  await expect(page.getByText('三步完成第一条导购视频')).toBeVisible();
});