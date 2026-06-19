import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

test('editor top bar and render review flow', async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ''}`);
  });

  const created = await request.post(`${apiBase}/api/templates`, {
    data: {
      name: `E2E editor smoke ${Date.now()}`,
      type: 'e2e',
      description: 'Browser smoke for editor interaction',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const template = await created.json() as { id: string };

  await page.goto(`/editor/${template.id}`);
  await expect(page.getByLabel('项目名称')).toBeVisible();
  await expect(page.getByTitle('选择数字人')).toBeVisible();
  await expect(page.getByTitle('选择品牌包')).toBeVisible();
  await expect(page.getByTitle('从资产库选择脚本')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成视频' })).toBeVisible();
  await page.locator('[data-tool="text"]').click();
  const toolPopover = page.locator('.absolute.left-0.top-full').first();
  await toolPopover.getByRole('button', { name: '文字', exact: true }).click();
  await toolPopover.getByRole('button', { name: '正文' }).click();
  await expect(page.getByText('正文内容').first()).toBeVisible();

  await page.getByRole('button', { name: '对象', exact: true }).click();
  const scaleInput = page.locator('label:has-text("缩放") input').last();
  await scaleInput.fill('120');
  await scaleInput.blur();
  await expect.poll(async () => Number(await scaleInput.inputValue())).toBe(120);

  const rotationInput = page.locator('label:has-text("旋转") input').last();
  await rotationInput.fill('15');
  await rotationInput.blur();
  await expect.poll(async () => Math.abs(Number(await rotationInput.inputValue()))).toBe(15);

  await expect(page.getByTestId('canvas-mode-edit')).toBeVisible();
  await page.getByTestId('canvas-mode-preview').click();
  await expect(page.getByTestId('canvas-mode-preview')).toHaveClass(/bg-white/);

  await page.getByRole('button', { name: '生成视频' }).click();
  const dialog = page.getByRole('dialog', { name: '生成前复核' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('成本与耗时预估')).toBeVisible();
  await expect(dialog.getByText('供应商与运行环境')).toBeVisible();
  await expect(dialog.getByText('需要处理')).toBeVisible();
  await expect(dialog.getByText('模板模式需要至少一段口播文案')).toBeVisible();

});