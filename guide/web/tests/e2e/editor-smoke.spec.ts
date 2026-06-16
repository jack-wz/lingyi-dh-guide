import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

test('Synthesia-like editor flow opens tools and render review', async ({ page, request }) => {
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
      name: `E2E Synthesia editor ${Date.now()}`,
      type: 'e2e',
      description: 'Browser smoke for editor interaction parity',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const template = await created.json();

  await page.goto(`/editor/${template.id}`);
  await expect(page.getByLabel('项目名称')).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate/i })).toBeVisible();
  await expect(page.getByText('品牌套件')).toBeVisible();
  await page.getByRole('button', { name: /应用 企业蓝/ }).click();
  await expect.poll(async () => {
    return page.locator('input').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  }).toContain('#1d4ed8');
  await page.getByRole('button', { name: 'Scene', exact: true }).click();
  await expect(page.getByText('品牌标题')).toBeVisible();

  await page.getByLabel('tool-text').click();
  await page.getByRole('button', { name: 'Body' }).click();
  await expect(page.getByText('Body').first()).toBeVisible();
  const scaleInput = page.locator('label:has-text("缩放") input').last();
  const rotationInput = page.locator('label:has-text("旋转") input').last();
  await expect(scaleInput).toHaveValue('90');

  const resizeHandle = page.getByTestId('object-resize-handle');
  const resizeBox = await resizeHandle.boundingBox();
  expect(resizeBox).not.toBeNull();
  if (!resizeBox) throw new Error('object resize handle not found');
  const resizeHandleX = resizeBox.x + resizeBox.width / 2;
  const resizeHandleY = resizeBox.y + resizeBox.height / 2;
  await page.mouse.move(resizeHandleX, resizeHandleY);
  await page.mouse.down();
  await page.mouse.move(resizeHandleX + 42, resizeHandleY + 28, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await scaleInput.inputValue())).toBeGreaterThan(100);

  const rotateHandle = page.getByTestId('object-rotate-handle');
  const rotateBox = await rotateHandle.boundingBox();
  expect(rotateBox).not.toBeNull();
  if (!rotateBox) throw new Error('object rotate handle not found');
  const rotateHandleX = rotateBox.x + rotateBox.width / 2;
  const rotateHandleY = rotateBox.y + rotateBox.height / 2;
  await page.mouse.move(rotateHandleX, rotateHandleY);
  await page.mouse.down();
  await page.mouse.move(rotateHandleX + 58, rotateHandleY, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs(Number(await rotationInput.inputValue()))).toBeGreaterThan(5);

  await page.getByLabel('tool-shape').click();
  await page.getByRole('button', { name: /Square/ }).click();
  await expect(page.getByText('Square').first()).toBeVisible();

  await page.getByLabel('tool-interactivity').click();
  await page.getByRole('button', { name: /Button/ }).click();
  await expect(page.getByText('Button').first()).toBeVisible();

  await page.getByRole('button', { name: /Generate/i }).first().click();
  const dialog = page.getByRole('dialog', { name: '生成前复核' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('成本与耗时预估')).toBeVisible();
  await expect(dialog.getByText('成本风险', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/低成本风险|中等成本风险|高成本风险/).first()).toBeVisible();
  await expect(dialog.getByText(/预计 \d+-\d+ 分钟/)).toBeVisible();
  await expect(dialog.getByText('供应商与运行环境')).toBeVisible();
  await expect(dialog.getByText('需要处理')).toBeVisible();
  await expect(dialog.getByText('模板模式需要至少一段口播文案')).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
