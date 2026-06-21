import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

async function waitForHfPreviewReady(page: import('@playwright/test').Page) {
  await expect.poll(async () => {
    const iframe = page.locator('iframe').first();
    if (await iframe.count() === 0) return false;
    return iframe.evaluate((el: HTMLIFrameElement) => {
      const stage = el.contentDocument?.getElementById('stage');
      const duration = Number(stage?.getAttribute('data-duration') || 0);
      return Number.isFinite(duration) && duration > 0;
    }).catch(() => false);
  }, { timeout: 20_000 }).toBeTruthy();
}

test('editor HF subtitle, transition and grain preview', async ({ page, request }) => {
  test.setTimeout(60_000);

  const created = await request.post(`${apiBase}/api/templates`, {
    data: {
      name: `E2E HF smoke ${Date.now()}`,
      type: 'e2e',
      description: 'HF style picker smoke',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const template = await created.json() as { id: string; dsl_json: { segments: Array<Record<string, unknown>> } };

  const narrationText = '导购口播词轴对齐测试';
  const seeded = await request.put(`${apiBase}/api/templates/${template.id}`, {
    data: {
      dsl_json: {
        ...template.dsl_json,
        globalConfig: {
          ...(template.dsl_json as { globalConfig?: Record<string, unknown> }).globalConfig,
          brand_color: '#4f46e5',
          transition_enabled: true,
        },
        segments: [
          {
            ...(template.dsl_json.segments?.[0] || {}),
            narration_text: narrationText,
            duration_sec: 5,
            subtitle: { enabled: true, style_id: 'default' },
            transition: { type: 'fade', duration: 0.6 },
          },
        ],
      },
    },
  });
  expect(seeded.ok(), await seeded.text()).toBeTruthy();

  await page.addInitScript(() => {
    localStorage.setItem('guide-editor-brand-prompted', '1');
  });

  await page.route('**/api/tts/preview-segment', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        audio_url: '/uploads/tts-preview/e2e-mock.wav',
        duration_sec: 5,
        word_timings: [
          { text: '导购', start: 0, end: 0.6 },
          { text: '口播', start: 0.6, end: 1.2 },
          { text: '词轴', start: 1.2, end: 1.8 },
          { text: '对齐', start: 1.8, end: 2.4 },
          { text: '测试', start: 2.4, end: 3.2 },
        ],
        word_timing_source: 'heuristic',
        tts_provider: 'e2e-mock',
      }),
    });
  });

  await page.goto(`/editor/${template.id}`);
  await expect(page.getByLabel('项目名称')).toBeVisible();

  const brandPicker = page.getByRole('heading', { name: '选择品牌套件' });
  if (await brandPicker.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(brandPicker).toBeHidden({ timeout: 5_000 });
  }

  await page.locator('[data-tool="text"]').click();
  await page.getByRole('button', { name: '字幕', exact: true }).click();
  await expect(page.getByText('动效字幕').first()).toBeVisible();
  await page.getByRole('button', { name: /高亮强调/ }).click();
  await page.keyboard.press('Escape');

  await page.getByTestId('inspector-tab-motion').click();
  const transitionSelect = page.getByTestId('segment-transition-type');
  await expect(transitionSelect).toBeVisible();
  await transitionSelect.selectOption('hf-dissolve');
  await expect(transitionSelect).toHaveValue('hf-dissolve');

  const grainToggle = page.locator('label').filter({ hasText: '胶片颗粒' }).locator('input[type="checkbox"]');
  await grainToggle.check();

  await expect(page.getByPlaceholder(/输入该分镜的口播文案/)).toHaveValue(narrationText, { timeout: 10_000 });

  const ttsBtn = page.locator('aside').getByTestId('segment-tts-preview');
  await expect(ttsBtn).toBeEnabled({ timeout: 10_000 });

  const [ttsResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/tts/preview-segment') && response.request().method() === 'POST',
      { timeout: 20_000 },
    ),
    ttsBtn.click(),
  ]);
  expect(ttsResponse.ok(), await ttsResponse.text()).toBeTruthy();

  await waitForHfPreviewReady(page);

  await page.getByRole('button', { name: '生成视频' }).click();
  const dialog = page.getByRole('dialog', { name: '生成前复核' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('成本与耗时预估')).toBeVisible();
});