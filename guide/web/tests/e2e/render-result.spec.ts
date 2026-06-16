import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

async function createTemplate(request: Parameters<Parameters<typeof test>[1]>[0]['request']) {
  const created = await request.post(`${apiBase}/api/templates`, {
    data: {
      name: `E2E render page ${Date.now()}`,
      type: 'e2e',
      description: 'Browser smoke for render task controls',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

async function createRender(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  templateId: string,
  extra: Record<string, unknown> = {},
) {
  const created = await request.post(`${apiBase}/api/renders`, {
    data: {
      template_id: templateId,
      pipeline_key: 'standard',
      input_mode: 'template',
      variables: {},
      max_retries: 2,
      ...extra,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

test('render task page supports cancel, retry, and duplicate from real controls', async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ''}`);
  });

  const template = await createTemplate(request);

  const cancellable = await createRender(request, template.id);
  await request.post(`${apiBase}/api/renders/${cancellable.id}/logs`, {
    data: { level: 'info', message: 'queued for browser cancellation' },
  });
  await page.goto(`/render/${cancellable.id}`);
  await expect(page.getByRole('heading', { name: '视频生成' })).toBeVisible();
  await expect(page.getByText('等待中')).toBeVisible();
  await expect(page.getByText('queued for browser cancellation').first()).toBeVisible();

  await page.getByRole('button', { name: '取消任务' }).click();
  await expect(page.getByRole('dialog', { name: '取消生成任务' })).toBeVisible();
  await page.getByRole('dialog', { name: '取消生成任务' }).getByRole('button', { name: '取消任务' }).click();
  await expect(page.getByText('任务已取消')).toBeVisible();
  await expect(page.getByText('用户已请求取消任务')).toBeVisible();

  const failed = await createRender(request, template.id);
  const patched = await request.patch(`${apiBase}/api/renders/${failed.id}`, {
    data: {
      status: 'failed',
      stage: 'failed',
      progress: 55,
      error_message: 'provider timeout in browser smoke',
    },
  });
  expect(patched.ok(), await patched.text()).toBeTruthy();

  await page.goto(`/render/${failed.id}`);
  await expect(page.getByText('生成失败')).toBeVisible();
  await expect(page.getByText('provider timeout in browser smoke')).toBeVisible();

  const failedUrl = page.url();
  await page.getByRole('button', { name: '重试' }).click();
  await page.waitForURL((url) => url.href !== failedUrl && /\/render\/[0-9a-f-]+$/.test(url.pathname));
  expect(page.url()).not.toContain(failed.id);
  await expect(page.getByText('等待中')).toBeVisible();
  await expect(page.getByText('1/2')).toBeVisible();

  const retryUrl = page.url();
  await page.getByRole('button', { name: '复制再生成' }).click();
  await page.waitForURL((url) => url.href !== retryUrl && /\/render\/[0-9a-f-]+$/.test(url.pathname));
  await expect(page.getByText('等待中')).toBeVisible();
  await expect(page.getByText('0/2')).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
