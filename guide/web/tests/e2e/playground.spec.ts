import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

async function createPlaygroundTemplate(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
) {
  const created = await request.post(`${apiBase}/api/templates`, {
    data: {
      name: `E2E playground ${Date.now()}`,
      type: 'e2e',
      description: 'Integrator playground smoke submit',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json() as Promise<{ id: string }>;
}

test('debug page loads integrator playground with API online', async ({ page }) => {
  await page.goto('/debug');

  await expect(page.getByRole('heading', { name: '调试控制台' })).toBeVisible();
  await expect(page.getByTestId('integrator-playground')).toBeVisible();
  await expect(page.getByText('集成方 Playground')).toBeVisible();
  await expect(page.getByTestId('playground-smoke-run')).toBeVisible();
  await expect(page.getByTestId('playground-submit-only')).toBeVisible();
  await expect(page.getByText('API 在线')).toBeVisible({ timeout: 15_000 });
});

test('playground submit-only enqueues a render job', async ({ page, request }) => {
  const template = await createPlaygroundTemplate(request);

  await page.goto('/debug');
  await expect(page.getByText('API 在线')).toBeVisible({ timeout: 15_000 });

  const templateInput = page.getByTestId('integrator-playground').locator('input.font-mono');
  await templateInput.fill(template.id);

  await page.getByTestId('playground-submit-only').click();

  await expect(page.getByTestId('api-toast')).toContainText('任务已入队', { timeout: 10_000 });
  await expect(
    page.getByTestId('integrator-playground').getByText(/Job: [0-9a-f-]{36}/),
  ).toBeVisible();
  await expect(page.getByText(/TTHW_ELAPSED_SEC=/)).toBeVisible();
});