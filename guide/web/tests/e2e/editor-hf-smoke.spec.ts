import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

function hfDslPatch() {
  return {
    segments: [
      {
        id: 'seg-hf-1',
        type: 'narration',
        narration_text: '限时特惠，立即抢购好物。',
        duration_sec: 5,
        scene_image_url: '',
        scene_description: '',
        camera_shot: '',
        segment_bgm_url: '',
        subtitle: {
          enabled: true,
          style_id: 'hf-caption-pill',
          position: 'bottom',
          animation: 'fadeIn',
          hf_params: { emphasis_words: ['特惠'] },
        },
        transition: { type: 'hf-zoom', duration: 0.6 },
        digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
        overlays: [],
        objects: [],
      },
    ],
    globalConfig: {
      transition_enabled: true,
      brand_color: '#2563eb',
      hf_overlays: [
        { type: 'hf-grain', enabled: true, opacity: 0.12 },
        { type: 'hf-vignette', enabled: false },
        { type: 'hf-light-leak', enabled: false },
        { type: 'hf-motion-blur', enabled: false },
      ],
    },
  };
}

test('editor hyperframes subtitle, transition, and TTS preview affordances', async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const created = await request.post(`${apiBase}/api/templates`, {
    data: {
      name: `E2E HF smoke ${Date.now()}`,
      type: 'e2e',
      description: 'HyperFrames editor smoke',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const template = await created.json() as { id: string; dsl_json: Record<string, unknown> };

  const put = await request.put(`${apiBase}/api/templates/${template.id}`, {
    data: {
      dsl_json: {
        ...template.dsl_json,
        ...hfDslPatch(),
      },
    },
  });
  expect(put.ok(), await put.text()).toBeTruthy();

  await page.goto(`/editor/${template.id}`);
  await expect(page.getByLabel('项目名称')).toBeVisible();

  await page.getByRole('button', { name: '跳过' }).click({ timeout: 3000 }).catch(() => undefined);
  if (await page.getByRole('heading', { name: '选择品牌套件' }).isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
  }

  await expect(page.getByTestId('segment-tts-preview')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('segment-tts-preview')).toBeEnabled();

  await page.getByRole('button', { name: '设计', exact: true }).click();
  await expect(page.getByText('场景转场')).toBeVisible();

  const transitionSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '缩放过渡（HF）' }) }).first();
  await expect(transitionSelect).toHaveValue('hf-zoom');
  await expect(page.getByText('完整动效需使用「HyperFrames 模板」流水线')).toBeVisible();

  const subtitleSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '药丸底栏（HF）' }) }).first();
  await expect(subtitleSelect).toHaveValue('hf-caption-pill');
  await expect(page.getByText('动效字幕由 HyperFrames 渲染')).toBeVisible();

  await page.getByTestId('canvas-mode-preview').click();
  await expect(page.getByTestId('canvas-mode-preview')).toHaveClass(/bg-white/);

  await page.getByRole('button', { name: '生成视频' }).click();
  const dialog = page.getByRole('dialog', { name: '生成前复核' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('li').filter({ hasText: 'HyperFrames' })).toHaveCount(2);

  const noise = consoleErrors.filter((line) => !/favicon|404|HyperFrames runtime/i.test(line));
  expect(noise, noise.join('\n')).toEqual([]);
});

test('TTS preview API validates input', async ({ request }) => {
  const res = await request.post(`${apiBase}/api/tts/preview-segment`, {
    data: { text: '   ' },
  });
  expect(res.status()).toBe(400);
});