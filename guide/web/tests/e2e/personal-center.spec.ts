import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

async function createTemplate(request: Parameters<Parameters<typeof test>[1]>[0]['request']) {
  const created = await request.post(`${apiBase}/api/templates`, {
    data: {
      name: `E2E personal center ${Date.now()}`,
      type: 'e2e',
      description: 'Browser smoke for personal center history',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json() as { id: string; name: string };
}

async function createCompletedRender(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  templateId: string,
  outputUrl: string,
) {
  const created = await request.post(`${apiBase}/api/renders`, {
    data: {
      template_id: templateId,
      pipeline_key: 'standard',
      input_mode: 'template',
      variables: {},
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const job = await created.json() as { id: string };

  const completed = await request.patch(`${apiBase}/api/renders/${job.id}`, {
    data: {
      status: 'completed',
      stage: 'completed',
      progress: 100,
      output_url: outputUrl,
    },
  });
  expect(completed.ok(), await completed.text()).toBeTruthy();
  return completed.json() as { id: string };
}

test('personal center shows playable and cleaned-output badges', async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ''}`);
  });

  const template = await createTemplate(request);
  await createCompletedRender(request, template.id, 'https://cdn.example.com/e2e-render.mp4');
  await createCompletedRender(
    request,
    template.id,
    `/renders/e2e-missing-${Date.now()}.mp4`,
  );

  await page.goto('/my-videos');
  await expect(page.getByRole('heading', { name: '我的视频' })).toBeVisible();
  await expect(page.getByText(template.name).first()).toBeVisible();

  const playableCard = page.getByRole('button', { name: new RegExp(`${template.name}.*可播放`) });
  const cleanedCard = page.getByRole('button', { name: new RegExp(`${template.name}.*成片已清理`) });
  await expect(playableCard).toBeVisible();
  await expect(cleanedCard).toBeVisible();

  const downloadLink = playableCard.getByRole('link', { name: '下载' });
  await expect(downloadLink).toBeVisible();
  await expect(downloadLink).toHaveAttribute('href', 'https://cdn.example.com/e2e-render.mp4');

  await cleanedCard.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('输出文件缺失，无法播放')).toBeVisible();
  await expect(dialog.getByRole('link', { name: '下载视频' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: '查看详情' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});