import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

type LibraryItem = {
  id: string;
  name: string;
  payload?: Record<string, unknown>;
};

async function createE2eTemplate(request: import('@playwright/test').APIRequestContext) {
  const created = await request.post(`${apiBase}/api/templates`, {
    data: {
      name: `E2E look preset ${Date.now()}`,
      type: 'e2e',
      description: 'look preset flow',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json() as Promise<{ id: string; dsl_json: Record<string, unknown> }>;
}

async function findLookPresetBySeed(
  request: import('@playwright/test').APIRequestContext,
  seedId: string,
) {
  const res = await request.get(`${apiBase}/api/library?category=look_preset&limit=40`);
  expect(res.ok()).toBeTruthy();
  const items = ((await res.json()) as { items?: LibraryItem[] }).items ?? [];
  const match = items.find((item) => String(item.payload?.seed_id || '') === seedId);
  expect(match, `look_preset seed ${seedId} missing`).toBeTruthy();
  return match as LibraryItem;
}

test('apply_look deep link applies preset and shows HF timeline markers', async ({ page, request }) => {
  test.setTimeout(60_000);

  const template = await createE2eTemplate(request);
  const preset = await findLookPresetBySeed(request, 'look-steady-voice');

  await page.addInitScript(() => {
    localStorage.setItem('guide-editor-brand-prompted', '1');
  });

  await page.goto(`/editor/${template.id}?apply_look=${encodeURIComponent(preset.id)}`);
  await expect(page.getByLabel('项目名称')).toBeVisible();

  const brandPicker = page.getByRole('heading', { name: '选择品牌套件' });
  if (await brandPicker.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
  }

  const transitionSelect = page.getByTestId('segment-transition-type');
  await expect(transitionSelect).toBeVisible();
  await expect(transitionSelect).toHaveValue('hf-dissolve');

  await expect(page.getByTestId('hf-pipeline-status')).toBeVisible();
  await page.getByTestId('editor-bottom-tab-timeline').click();
  await expect(page.getByTestId('timeline-track-overlay')).toBeVisible();
  await expect(page.getByText('暗角').first()).toBeVisible();
});

test('brand look preset banner applies recommended steady-voice preset', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  expect(brandsRes.ok()).toBeTruthy();
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  const updatedPayload = {
    ...originalPayload,
    category: 'enterprise',
    default_look_preset_seed_id: 'look-steady-voice',
    recommended_look_preset_seed_ids: ['look-steady-voice', 'look-editorial-premium'],
  };

  const brandPut = await request.put(`${apiBase}/api/library/${brand.id}`, {
    data: { payload: updatedPayload },
  });
  expect(brandPut.ok(), await brandPut.text()).toBeTruthy();

  try {
    const template = await createE2eTemplate(request);
    const dsl = template.dsl_json as {
      globalConfig?: Record<string, unknown>;
      segments?: Array<Record<string, unknown>>;
    };

    const seeded = await request.put(`${apiBase}/api/templates/${template.id}`, {
      data: {
        dsl_json: {
          ...dsl,
          globalConfig: {
            ...(dsl.globalConfig || {}),
            brand_pack_id: brand.id,
            brand_pack: updatedPayload,
            transition_enabled: true,
          },
          segments: [
            {
              ...(dsl.segments?.[0] || {}),
              narration_text: '品牌外观预设引导测试',
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

    await page.goto(`/editor/${template.id}`);
    await expect(page.getByTestId('brand-look-preset-banner')).toBeVisible();
    await page.getByTestId('brand-banner-apply-look-steady-voice').click();

    await expect(page.getByTestId('segment-transition-type')).toHaveValue('hf-dissolve');
    await expect(page.getByTestId('brand-look-preset-banner')).toBeHidden();
    await page.getByTestId('editor-bottom-tab-timeline').click();
    await expect(page.getByTestId('timeline-track-overlay')).toBeVisible();
  } finally {
    await request.put(`${apiBase}/api/library/${brand.id}`, {
      data: { payload: originalPayload },
    });
  }
});

test('brand look preset banner apply-all applies default recommended preset', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  expect(brandsRes.ok()).toBeTruthy();
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  const updatedPayload = {
    ...originalPayload,
    category: 'enterprise',
    default_look_preset_seed_id: 'look-steady-voice',
    recommended_look_preset_seed_ids: ['look-steady-voice', 'look-editorial-premium'],
  };

  const brandPut = await request.put(`${apiBase}/api/library/${brand.id}`, {
    data: { payload: updatedPayload },
  });
  expect(brandPut.ok(), await brandPut.text()).toBeTruthy();

  try {
    const template = await createE2eTemplate(request);
    const dsl = template.dsl_json as {
      globalConfig?: Record<string, unknown>;
      segments?: Array<Record<string, unknown>>;
    };

    const seeded = await request.put(`${apiBase}/api/templates/${template.id}`, {
      data: {
        dsl_json: {
          ...dsl,
          globalConfig: {
            ...(dsl.globalConfig || {}),
            brand_pack_id: brand.id,
            brand_pack: updatedPayload,
            transition_enabled: true,
          },
          segments: [
            {
              ...(dsl.segments?.[0] || {}),
              narration_text: '品牌一键套用推荐测试',
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

    await page.goto(`/editor/${template.id}`);
    await expect(page.getByTestId('brand-look-preset-banner')).toBeVisible();
    await page.getByTestId('brand-banner-apply-all-recommended').click();

    await expect(page.getByTestId('api-toast')).toContainText('已套用默认');
    await expect(page.getByTestId('api-toast')).toContainText('另有');
    await expect(page.getByTestId('segment-transition-type')).toHaveValue('hf-dissolve');
    await expect(page.getByTestId('brand-look-preset-banner')).toBeHidden();
  } finally {
    await request.put(`${apiBase}/api/library/${brand.id}`, {
      data: { payload: originalPayload },
    });
  }
});

test('brand editor saves appearance preset settings to library payload', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  expect(brandsRes.ok()).toBeTruthy();
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  await page.goto('/assets?tab=brand');
  await expect(page.getByRole('heading', { name: '资产库' })).toBeVisible();

  const card = page.locator('[role="button"]').filter({ hasText: brand.name }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '编辑' }).click();

  await expect(page.getByText(/编辑品牌包/)).toBeVisible();
  await page.getByTestId('brand-section-motionPresets').click();
  await expect(page.getByTestId('brand-look-preset-editor')).toBeVisible();

  await page.getByTestId('brand-look-category').selectOption('大促');
  await page.getByTestId('brand-look-default').selectOption('look-promo-fast');

  const [saveResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes(`/api/library/${brand.id}`) && response.request().method() === 'PUT',
      { timeout: 20_000 },
    ),
    page.getByRole('button', { name: '保存' }).click(),
  ]);
  expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();

  const refreshed = await request.get(`${apiBase}/api/library/${brand.id}`);
  expect(refreshed.ok()).toBeTruthy();
  const saved = (await refreshed.json()) as LibraryItem;
  expect(saved.payload?.category).toBe('大促');
  expect(saved.payload?.default_look_preset_seed_id).toBe('look-promo-fast');
  expect(saved.payload?.recommended_look_preset_seed_ids).toContain('look-promo-fast');

  await request.put(`${apiBase}/api/library/${brand.id}`, {
    data: { payload: originalPayload },
  });
});

test('brand editor saves seed preview tags via key-value form', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  expect(brandsRes.ok()).toBeTruthy();
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  await page.goto('/assets?tab=brand');
  const card = page.locator('[role="button"]').filter({ hasText: brand.name }).first();
  await card.getByRole('button', { name: '编辑' }).click();
  await page.getByTestId('brand-section-motionPresets').click();
  await expect(page.getByTestId('brand-look-seed-preview-tags')).toBeVisible();

  await page.getByTestId('brand-look-seed-tag-select-0').selectOption('look-grade-cinema');
  await page.getByTestId('brand-look-seed-tag-label-0').fill('集成方影院');

  const [saveResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes(`/api/library/${brand.id}`) && response.request().method() === 'PUT',
      { timeout: 20_000 },
    ),
    page.getByRole('button', { name: '保存' }).click(),
  ]);
  expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();

  const refreshed = await request.get(`${apiBase}/api/library/${brand.id}`);
  const saved = (await refreshed.json()) as LibraryItem;
  const tags = saved.payload?.look_preset_seed_preview_tags as Record<string, string> | undefined;
  expect(tags?.['look-grade-cinema']).toBe('集成方影院');

  await request.put(`${apiBase}/api/library/${brand.id}`, {
    data: {
      payload: {
        ...originalPayload,
        look_preset_seed_preview_tags: originalPayload.look_preset_seed_preview_tags ?? null,
      },
    },
  });
});

test('brand editor shows bundle export field preview', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  const brand = brands[0];

  await page.goto('/assets?tab=brand');
  const card = page.locator('[role="button"]').filter({ hasText: brand.name }).first();
  await card.getByRole('button', { name: '编辑' }).click();
  await page.getByTestId('brand-section-motionPresets').click();
  await expect(page.getByTestId('brand-look-bundle-export-preview')).toBeVisible();
  await expect(page.getByTestId('brand-look-bundle-export-preview')).toContainText('brand_payload');
  await expect(page.getByTestId('brand-look-bundle-export-preview')).toContainText('category');
});

test('brand editor imports builtin seed preview tags', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  await page.goto('/assets?tab=brand');
  const card = page.locator('[role="button"]').filter({ hasText: brand.name }).first();
  await card.getByRole('button', { name: '编辑' }).click();
  await page.getByTestId('brand-section-motionPresets').click();
  await page.getByTestId('brand-look-seed-tag-import-builtin').click();
  await expect(page.getByTestId('brand-look-seed-tag-select-0')).toHaveValue('look-grade-cinema');
  await expect(page.getByTestId('brand-look-seed-tag-label-0')).toHaveValue('影院调色');

  await request.put(`${apiBase}/api/library/${brand.id}`, {
    data: {
      payload: {
        ...originalPayload,
        look_preset_seed_preview_tags: originalPayload.look_preset_seed_preview_tags ?? null,
      },
    },
  });
});

test('brand editor imports brand_hints JSON into appearance settings', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  expect(brandsRes.ok()).toBeTruthy();
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  const hintsDoc = {
    brand_hints: {
      category: '美妆',
      default_look_preset_seed_id: 'look-circle-beauty',
      recommended_look_preset_seed_ids: ['look-circle-beauty', 'look-editorial-premium'],
      default_look_preset_library_id: 'lib-import-demo',
      recommended_look_preset_library_ids: ['lib-import-demo'],
    },
  };

  await page.goto('/assets?tab=brand');
  const card = page.locator('[role="button"]').filter({ hasText: brand.name }).first();
  await card.getByRole('button', { name: '编辑' }).click();
  await page.getByTestId('brand-section-motionPresets').click();

  await page.getByTestId('brand-look-import-hints').setInputFiles({
    name: 'brand-hints.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(hintsDoc), 'utf8'),
  });

  await expect(page.getByTestId('brand-look-import-msg')).toContainText('美妆');
  await expect(page.getByTestId('brand-look-category')).toHaveValue('美妆');
  await expect(page.getByTestId('brand-look-default')).toHaveValue('look-circle-beauty');
  await expect(page.getByTestId('brand-look-recommend-look-circle-beauty')).toBeChecked();
  await expect(page.getByTestId('brand-look-library-refs')).toContainText('lib-import-demo');

  const [saveResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes(`/api/library/${brand.id}`) && response.request().method() === 'PUT',
      { timeout: 20_000 },
    ),
    page.getByRole('button', { name: '保存' }).click(),
  ]);
  expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();

  const refreshed = await request.get(`${apiBase}/api/library/${brand.id}`);
  const saved = (await refreshed.json()) as LibraryItem;
  expect(saved.payload?.default_look_preset_seed_id).toBe('look-circle-beauty');
  expect(saved.payload?.default_look_preset_library_id).toBe('lib-import-demo');

  await request.put(`${apiBase}/api/library/${brand.id}`, {
    data: { payload: originalPayload },
  });
});

test('brand editor imports look bundle with hints and presets', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  expect(brandsRes.ok()).toBeTruthy();
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];

  const bundleName = `E2E 迁移包预设 ${Date.now()}`;
  const bundle = {
    format: 'guide-brand-look-bundle',
    version: 1,
    exported_at: new Date().toISOString(),
    brand_name: brand.name,
    brand_hints: {
      category: '导购',
      default_look_preset_seed_id: 'look-stagger-guide',
      recommended_look_preset_seed_ids: ['look-stagger-guide', 'look-wipe-retail'],
    },
    look_presets: [
      {
        format: 'guide-look-preset',
        version: 1,
        name: bundleName,
        payload: {
          subtitle_style_id: 'hf-caption-stagger',
          transition_type: 'hf-dissolve',
          transition_duration: 0.62,
          hf_overlays: [{ type: 'hf-color-grade', enabled: true, grade_warmth: 0.55, grade_strength: 0.26 }],
          pipeline_required: 'template_editor',
          registry_version: '2026.06.3',
        },
        exported_at: new Date().toISOString(),
        registry_version: '2026.06.3',
      },
    ],
  };

  await page.goto('/assets?tab=brand');
  const card = page.locator('[role="button"]').filter({ hasText: brand.name }).first();
  await card.getByRole('button', { name: '编辑' }).click();
  await page.getByTestId('brand-section-motionPresets').click();

  await page.getByTestId('brand-look-import-bundle').setInputFiles({
    name: 'brand-look-bundle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle), 'utf8'),
  });

  await expect(page.getByTestId('brand-look-import-msg')).toContainText('导购');
  await expect(page.getByTestId('brand-look-category')).toHaveValue('导购');
  await expect(page.getByTestId('brand-look-default')).toHaveValue('look-stagger-guide');
  await expect(page.getByTestId('brand-look-recommend-look-stagger-guide')).toBeChecked();

  const presetsRes = await request.get(`${apiBase}/api/library?category=look_preset&limit=80`);
  const presets = ((await presetsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(presets.some((item) => item.name === bundleName)).toBeTruthy();

  const imported = presets.find((item) => item.name === bundleName);
  if (imported?.id) {
    await request.delete(`${apiBase}/api/library/${imported.id}`);
  }
});

test('brand bundle import remaps custom library ids to new rows', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];

  const oldLibId = `lib-cross-env-${Date.now()}`;
  const bundleName = `E2E 跨环境预设 ${Date.now()}`;
  const bundle = {
    format: 'guide-brand-look-bundle',
    version: 1,
    exported_at: new Date().toISOString(),
    brand_hints: {
      category: '大促',
      default_look_preset_library_id: oldLibId,
      recommended_look_preset_library_ids: [oldLibId],
    },
    look_presets: [
      {
        format: 'guide-look-preset',
        version: 1,
        name: bundleName,
        source_library_id: oldLibId,
        payload: {
          subtitle_style_id: 'hf-caption-pop',
          transition_type: 'hf-push-up',
          transition_duration: 0.5,
          pipeline_required: 'template_editor',
          registry_version: '2026.06.3',
        },
        exported_at: new Date().toISOString(),
        registry_version: '2026.06.3',
      },
    ],
  };

  await page.goto('/assets?tab=brand');
  const card = page.locator('[role="button"]').filter({ hasText: brand.name }).first();
  await card.getByRole('button', { name: '编辑' }).click();
  await page.getByTestId('brand-section-motionPresets').click();

  await page.getByTestId('brand-look-import-bundle').setInputFiles({
    name: 'cross-env-bundle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle), 'utf8'),
  });

  await expect(page.getByTestId('brand-look-import-msg')).toContainText('重映射');
  await expect(page.getByTestId('brand-look-library-refs')).not.toContainText(oldLibId);

  const presetsRes = await request.get(`${apiBase}/api/library?category=look_preset&limit=100`);
  const imported = ((await presetsRes.json()) as { items?: LibraryItem[] }).items?.find((item) => item.name === bundleName);
  expect(imported?.id).toBeTruthy();
  await expect(page.getByTestId('brand-look-library-refs')).toContainText(imported!.id.slice(0, 8));

  if (imported?.id) {
    await request.delete(`${apiBase}/api/library/${imported.id}`);
  }
});

test('brand banner shows custom look preset name and badge', async ({ page, request }) => {
  test.setTimeout(60_000);

  const created = await request.post(`${apiBase}/api/library`, {
    data: {
      category: 'look_preset',
      name: `E2E Banner 自定义 ${Date.now()}`,
      payload: {
        subtitle_style_id: 'hf-caption-pop',
        transition_type: 'hf-push-up',
        transition_duration: 0.5,
        pipeline_required: 'template_editor',
        registry_version: '2026.06.3',
      },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const preset = await created.json() as LibraryItem;

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  const brand = ((await brandsRes.json()) as { items?: LibraryItem[] }).items?.[0];
  expect(brand).toBeTruthy();
  const originalPayload = { ...(brand!.payload || {}) };

  const updatedPayload = {
    ...originalPayload,
    category: '大促',
    default_look_preset_library_id: preset.id,
    recommended_look_preset_library_ids: [preset.id],
  };
  await request.put(`${apiBase}/api/library/${brand!.id}`, { data: { payload: updatedPayload } });

  const template = await createE2eTemplate(request);
  const templateGet = await request.get(`${apiBase}/api/templates/${template.id}`);
  const dsl = ((await templateGet.json()) as { dsl_json: Record<string, unknown> }).dsl_json;

  await request.put(`${apiBase}/api/templates/${template.id}`, {
    data: {
      dsl_json: {
        ...dsl,
        globalConfig: {
          ...((dsl.globalConfig || {}) as Record<string, unknown>),
          brand_pack_id: brand!.id,
          brand_pack: updatedPayload,
        },
      },
    },
  });

  try {
    await page.addInitScript(() => {
      localStorage.setItem('guide-editor-brand-prompted', '1');
    });
    await page.goto(`/editor/${template.id}`);
    await expect(page.getByTestId('brand-look-preset-banner')).toBeVisible();
    await expect(page.getByTestId(`brand-banner-apply-${preset.id}`)).toContainText(preset.name);
    await expect(page.getByTestId(`brand-banner-custom-${preset.id}`)).toBeVisible();
  } finally {
    await request.delete(`${apiBase}/api/library/${preset.id}`);
    await request.put(`${apiBase}/api/library/${brand!.id}`, { data: { payload: originalPayload } });
  }
});