import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

async function waitForHfPreviewReady(page: import('@playwright/test').Page) {
  await expect.poll(async () => {
    const iframe = page.locator('iframe').first();
    if (await iframe.count() === 0) return false;
    return iframe.evaluate((el: HTMLIFrameElement) => {
      const stage = el.contentDocument?.getElementById('stage');
      const duration = Number(stage?.getAttribute('data-duration') || 0);
      const doc = el.contentDocument;
      const hasStagger = Boolean(
        doc?.querySelector('[data-hf-component="caption-stagger-slide"]')
        || doc?.querySelector('.hf-caption-stagger'),
      );
      return Number.isFinite(duration) && duration > 0 && hasStagger;
    }).catch(() => false);
  }, { timeout: 35_000 }).toBeTruthy();
}

test('editor previews hf-caption-stagger slide subtitles', async ({ page, request }) => {
  test.setTimeout(90_000);

  const created = await request.post(`${apiBase}/api/templates`, {
    data: {
      name: `E2E HF stagger ${Date.now()}`,
      type: 'e2e',
      description: 'hf-caption-stagger preview',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const template = await created.json() as { id: string; dsl_json: { segments: Array<Record<string, unknown>> } };

  const narrationText = '错落字幕预览测试';
  const seeded = await request.put(`${apiBase}/api/templates/${template.id}`, {
    data: {
      dsl_json: {
        ...template.dsl_json,
        segments: [
          {
            ...(template.dsl_json.segments?.[0] || {}),
            narration_text: narrationText,
            duration_sec: 5,
            subtitle: { enabled: true, style_id: 'default' },
          },
        ],
      },
    },
  });
  expect(seeded.ok(), await seeded.text()).toBeTruthy();

  await page.addInitScript(() => {
    localStorage.setItem('guide-editor-brand-prompted', '1');
  });

  await page.goto(`/editor/${template.id}`);
  await expect(page.getByLabel('项目名称')).toBeVisible();

  const brandPicker = page.getByRole('heading', { name: '选择品牌套件' });
  if (await brandPicker.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
  }

  await page.locator('[data-tool="text"]').click();
  await page.getByRole('button', { name: '字幕', exact: true }).click();
  await page.getByTestId('subtitle-style-card-hf-caption-stagger').click();

  await expect(page.getByPlaceholder(/输入该分镜的口播文案/)).toHaveValue(narrationText, { timeout: 10_000 });
  await page.getByTestId('canvas-mode-preview').click();
  await expect(page.getByTestId('preview-state-ready')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('iframe').first()).toBeAttached({ timeout: 15_000 });
  await waitForHfPreviewReady(page);
});