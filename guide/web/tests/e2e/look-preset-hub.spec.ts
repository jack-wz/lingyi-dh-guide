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
      name: `E2E look hub ${Date.now()}`,
      type: 'e2e',
      description: 'look preset hub flow',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json() as Promise<{ id: string }>;
}

test('asset hub creates, edits and applies custom look preset', async ({ page, request }) => {
  test.setTimeout(60_000);

  const presetName = `E2E 自定义预设 ${Date.now()}`;

  await page.goto('/assets?tab=look_preset');
  await expect(page.getByRole('heading', { name: '资产库' })).toBeVisible();
  await page.getByRole('button', { name: '新建预设' }).click();
  await expect(page.getByTestId('look-preset-form')).toBeVisible();

  await page.getByTestId('look-preset-name').fill(presetName);
  await page.getByTestId('look-preset-transition').selectOption('hf-push-left');
  await page.getByTestId('look-preset-overlay-hf-grain').check();
  await page.getByTestId('look-preset-overlay-hf-vignette').check();

  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/library') && response.request().method() === 'POST',
      { timeout: 20_000 },
    ),
    page.getByTestId('look-preset-save').click(),
  ]);
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const created = await createResponse.json() as LibraryItem;
  expect(created.id).toBeTruthy();

  try {
    await expect(page.getByText(presetName).first()).toBeVisible({ timeout: 10_000 });

    const card = page.locator('[role="button"]').filter({ hasText: presetName }).first();
    await card.getByRole('button', { name: '编辑' }).click();
    await expect(page.getByTestId('look-preset-form')).toBeVisible();
    await page.getByTestId('look-preset-transition').selectOption('hf-wipe-right');

    const [updateResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/api/library/${created.id}`) && response.request().method() === 'PUT',
        { timeout: 20_000 },
      ),
      page.getByTestId('look-preset-save').click(),
    ]);
    expect(updateResponse.ok(), await updateResponse.text()).toBeTruthy();

    const refreshed = await request.get(`${apiBase}/api/library/${created.id}`);
    expect(refreshed.ok()).toBeTruthy();
    const saved = await refreshed.json() as LibraryItem;
    expect(saved.payload?.transition_type).toBe('hf-wipe-right');
    const overlays = saved.payload?.hf_overlays as Array<{ type: string; enabled?: boolean }> | undefined;
    expect(overlays?.some((item) => item.type === 'hf-grain' && item.enabled)).toBeTruthy();
    expect(overlays?.some((item) => item.type === 'hf-vignette' && item.enabled)).toBeTruthy();

    const template = await createE2eTemplate(request);
    await page.addInitScript(() => {
      localStorage.setItem('guide-editor-brand-prompted', '1');
    });
    await page.goto(`/assets?tab=look_preset&from=/editor/${template.id}`);
    await card.getByRole('link', { name: '应用到项目' }).click();

    await expect(page.getByLabel('项目名称')).toBeVisible();
    await expect(page.getByTestId('segment-transition-type')).toHaveValue('hf-wipe-right');
  } finally {
    await request.delete(`${apiBase}/api/library/${created.id}`);
  }
});

test('stale look preset shows sync badge in asset hub', async ({ page, request }) => {
  const presetsRes = await request.get(`${apiBase}/api/library?category=look_preset&limit=40`);
  expect(presetsRes.ok()).toBeTruthy();
  const items = ((await presetsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  const seeded = items.find((item) => item.payload?.seed_id === 'look-steady-voice');
  expect(seeded).toBeTruthy();

  const originalPayload = { ...(seeded!.payload || {}) };
  const stalePut = await request.put(`${apiBase}/api/library/${seeded!.id}`, {
    data: {
      payload: {
        ...originalPayload,
        registry_version: '2025.01',
      },
    },
  });
  expect(stalePut.ok(), await stalePut.text()).toBeTruthy();

  try {
    await page.goto('/assets?tab=look_preset');
    await expect(page.getByTestId(`look-preset-stale-${seeded!.id}`)).toBeVisible();
  } finally {
    await request.put(`${apiBase}/api/library/${seeded!.id}`, {
      data: { payload: originalPayload },
    });
  }
});

test('look-grade-cinema card shows cinema preview tag', async ({ page, request }) => {
  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=80`);
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  for (const brand of brands) {
    if (!brand.payload?.look_preset_seed_preview_tags) continue;
    await request.put(`${apiBase}/api/library/${brand.id}`, {
      data: {
        payload: {
          ...(brand.payload || {}),
          look_preset_seed_preview_tags: null,
        },
      },
    });
  }

  const presetsRes = await request.get(`${apiBase}/api/library?category=look_preset&limit=60`);
  const items = ((await presetsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  const cinema = items.find((item) => item.payload?.seed_id === 'look-grade-cinema');
  expect(cinema).toBeTruthy();

  await page.goto('/assets?tab=look_preset');
  const card = page.locator('[role="button"]').filter({ hasText: cinema!.name }).first();
  await expect(card.getByTestId('look-preset-card-seed-tag-look-grade-cinema')).toBeVisible();
  await expect(card.getByTestId('look-preset-card-seed-tag-look-grade-cinema')).toContainText('影院调色');
});

test('brand seed preview tag overrides appear on look preset cards', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  expect(brandsRes.ok()).toBeTruthy();
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  const updatedPayload = {
    ...originalPayload,
    look_preset_seed_preview_tags: {
      'look-grade-cinema': '集成方影院',
    },
  };

  const brandPut = await request.put(`${apiBase}/api/library/${brand.id}`, {
    data: { payload: updatedPayload },
  });
  expect(brandPut.ok(), await brandPut.text()).toBeTruthy();

  const presetsRes = await request.get(`${apiBase}/api/library?category=look_preset&limit=60`);
  const items = ((await presetsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  const cinema = items.find((item) => item.payload?.seed_id === 'look-grade-cinema');
  expect(cinema).toBeTruthy();

  try {
    await page.goto('/assets?tab=look_preset');
    const card = page.locator('[role="button"]').filter({ hasText: cinema!.name }).first();
    await expect(card.getByTestId('look-preset-card-seed-tag-look-grade-cinema')).toContainText('集成方影院');
  } finally {
    await request.put(`${apiBase}/api/library/${brand.id}`, {
      data: {
        payload: {
          ...originalPayload,
          look_preset_seed_preview_tags: originalPayload.look_preset_seed_preview_tags ?? null,
        },
      },
    });
  }
});

test('look preset cards show mini HF thumbnail preview', async ({ page, request }) => {
  const presetsRes = await request.get(`${apiBase}/api/library?category=look_preset&limit=5`);
  expect(presetsRes.ok()).toBeTruthy();
  const items = ((await presetsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(items.length).toBeGreaterThan(0);

  await page.goto('/assets?tab=look_preset');
  await expect(page.getByTestId(`look-preset-thumb-${items[0].id}`)).toBeVisible();
});

test('imports look preset JSON into asset hub form', async ({ page }) => {
  const doc = {
    format: 'guide-look-preset',
    version: 1,
    name: `E2E 导入预设 ${Date.now()}`,
    description: 'import test',
    payload: {
      subtitle_style_id: 'hf-caption-pop',
      transition_type: 'hf-push-up',
      transition_duration: 0.48,
      hf_overlays: [
        { type: 'hf-grain', enabled: true, opacity: 0.14 },
        { type: 'hf-vignette', enabled: true, intensity: 0.55, vignette_size: 46 },
      ],
      pipeline_required: 'template_editor',
    },
  };

  await page.goto('/assets?tab=look_preset');
  await page.getByRole('button', { name: '新建预设' }).click();

  const json = JSON.stringify(doc);
  await page.getByTestId('look-preset-import-json').setInputFiles({
    name: 'look-preset.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json, 'utf8'),
  });

  await expect(page.getByTestId('look-preset-name')).toHaveValue(doc.name);
  await expect(page.getByTestId('look-preset-subtitle')).toHaveValue('hf-caption-pop');
  await expect(page.getByTestId('look-preset-transition')).toHaveValue('hf-push-up');
  await expect(page.getByTestId('look-preset-overlay-hf-grain')).toBeChecked();
  await expect(page.getByTestId('look-preset-overlay-hf-vignette')).toBeChecked();
  await expect(page.getByTestId('look-preset-overlay-hf-grain-opacity')).toHaveValue('0.14');
  await expect(page.getByTestId('look-preset-form-thumb')).toBeVisible();
});

test('import JSON then save and apply redirects to editor with preset', async ({ page, request }) => {
  test.setTimeout(60_000);

  const template = await createE2eTemplate(request);
  const presetName = `E2E 导入并应用 ${Date.now()}`;
  const doc = {
    format: 'guide-look-preset',
    version: 1,
    name: presetName,
    description: 'import apply flow',
    brand_hints: {
      category: '大促',
      default_look_preset_seed_id: 'look-pop-energetic',
      recommended_look_preset_seed_ids: ['look-pop-energetic', 'look-promo-fast'],
    },
    payload: {
      seed_id: 'look-pop-energetic',
      subtitle_style_id: 'hf-caption-pop',
      transition_type: 'hf-push-up',
      transition_duration: 0.46,
      hf_overlays: [{ type: 'hf-grain', enabled: true, opacity: 0.1 }],
      pipeline_required: 'template_editor',
    },
  };

  let createdId = '';
  try {
    await page.addInitScript(() => {
      localStorage.setItem('guide-editor-brand-prompted', '1');
    });
    await page.goto(`/assets?tab=look_preset&from=/editor/${template.id}`);
    await page.getByRole('button', { name: '新建预设' }).click();

    await page.getByTestId('look-preset-import-json').setInputFiles({
      name: 'look-preset.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc), 'utf8'),
    });

    await expect(page.getByTestId('look-preset-import-brand-hints')).toContainText('大促');
    await expect(page.getByTestId('look-preset-save-apply')).toBeVisible();

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes('/api/library') && response.request().method() === 'POST',
        { timeout: 20_000 },
      ),
      page.getByTestId('look-preset-save-apply').click(),
    ]);
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    const created = await createResponse.json() as LibraryItem;
    createdId = created.id;

    await expect(page.getByLabel('项目名称')).toBeVisible();
    await expect(page.getByTestId('segment-transition-type')).toHaveValue('hf-push-up');
  } finally {
    if (createdId) await request.delete(`${apiBase}/api/library/${createdId}`);
  }
});

test('export JSON writes brand hints to bound brand pack from editor deep link', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  expect(brandsRes.ok()).toBeTruthy();
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  const template = await createE2eTemplate(request);
  const templateGet = await request.get(`${apiBase}/api/templates/${template.id}`);
  const templateBody = await templateGet.json() as { dsl_json: Record<string, unknown> };
  const dsl = templateBody.dsl_json as {
    globalConfig?: Record<string, unknown>;
    segments?: Array<Record<string, unknown>>;
  };

  await request.put(`${apiBase}/api/templates/${template.id}`, {
    data: {
      dsl_json: {
        ...dsl,
        globalConfig: {
          ...(dsl.globalConfig || {}),
          brand_pack_id: brand.id,
          brand_pack: brand.payload || {},
        },
      },
    },
  });

  const presetsRes = await request.get(`${apiBase}/api/library?category=look_preset&limit=40`);
  const presets = ((await presetsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  const stagger = presets.find((item) => item.payload?.seed_id === 'look-stagger-guide');
  expect(stagger).toBeTruthy();

  try {
    await page.addInitScript(() => {
      localStorage.setItem('guide-editor-brand-prompted', '1');
    });
    await page.goto(`/assets?tab=look_preset&from=/editor/${template.id}`);
    const card = page.locator('[role="button"]').filter({ hasText: stagger!.name }).first();
    await card.getByRole('button', { name: '编辑' }).click();
    await expect(page.getByTestId('look-preset-export-apply-brand')).toBeVisible();

    const [brandUpdate] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/api/library/${brand.id}`) && response.request().method() === 'PUT',
        { timeout: 20_000 },
      ),
      page.getByTestId('look-preset-export-apply-brand').click(),
    ]);
    expect(brandUpdate.ok(), await brandUpdate.text()).toBeTruthy();

    const refreshed = await request.get(`${apiBase}/api/library/${brand.id}`);
    const saved = await refreshed.json() as LibraryItem;
    expect(saved.payload?.default_look_preset_seed_id).toBe('look-stagger-guide');
    expect(saved.payload?.recommended_look_preset_seed_ids).toContain('look-stagger-guide');
    expect(saved.payload?.category).toBe('导购');
  } finally {
    await request.put(`${apiBase}/api/library/${brand.id}`, {
      data: { payload: originalPayload },
    });
  }
});

test('custom look preset without seed_id writes library brand hints', async ({ page, request }) => {
  test.setTimeout(60_000);

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  const created = await request.post(`${apiBase}/api/library`, {
    data: {
      category: 'look_preset',
      name: `E2E 无种子预设 ${Date.now()}`,
      description: 'custom without seed',
      payload: {
        subtitle_style_id: 'hf-caption-pop',
        transition_type: 'hf-push-up',
        transition_duration: 0.5,
        hf_overlays: [{ type: 'hf-grain', enabled: true, opacity: 0.1 }],
        pipeline_required: 'template_editor',
        registry_version: '2026.06.3',
      },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const preset = await created.json() as LibraryItem;

  const template = await createE2eTemplate(request);
  const templateGet = await request.get(`${apiBase}/api/templates/${template.id}`);
  const dsl = ((await templateGet.json()) as { dsl_json: Record<string, unknown> }).dsl_json;

  await request.put(`${apiBase}/api/templates/${template.id}`, {
    data: {
      dsl_json: {
        ...dsl,
        globalConfig: {
          ...((dsl.globalConfig || {}) as Record<string, unknown>),
          brand_pack_id: brand.id,
        },
      },
    },
  });

  try {
    await page.addInitScript(() => {
      localStorage.setItem('guide-editor-brand-prompted', '1');
    });
    await page.goto(`/assets?tab=look_preset&from=/editor/${template.id}`);
    const card = page.locator('[role="button"]').filter({ hasText: preset.name }).first();
    await card.getByRole('button', { name: '编辑' }).click();
    await expect(page.getByTestId('look-preset-apply-brand-hints')).toBeVisible();

    const [brandUpdate] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/api/library/${brand.id}`) && response.request().method() === 'PUT',
        { timeout: 20_000 },
      ),
      page.getByTestId('look-preset-apply-brand-hints').click(),
    ]);
    expect(brandUpdate.ok(), await brandUpdate.text()).toBeTruthy();

    const refreshed = await request.get(`${apiBase}/api/library/${brand.id}`);
    const saved = await refreshed.json() as LibraryItem;
    expect(saved.payload?.default_look_preset_library_id).toBe(preset.id);
    expect(saved.payload?.recommended_look_preset_library_ids).toContain(preset.id);
    expect(saved.payload?.category).toBe('大促');
  } finally {
    await request.delete(`${apiBase}/api/library/${preset.id}`);
    await request.put(`${apiBase}/api/library/${brand.id}`, { data: { payload: originalPayload } });
  }
});

test('motion panel shows mini thumbnails for look presets', async ({ page, request }) => {
  const template = await createE2eTemplate(request);
  await page.addInitScript(() => {
    localStorage.setItem('guide-editor-brand-prompted', '1');
  });
  await page.goto(`/editor/${template.id}`);
  await expect(page.getByLabel('项目名称')).toBeVisible();
  await page.getByTestId('inspector-tab-motion').click();
  await expect(page.getByTestId('motion-preset-thumb-look-steady-voice')).toBeVisible();
  await expect(page.getByTestId('motion-preset-thumb-inner-look-steady-voice')).toBeVisible();
});

test('sync all stale look presets via asset hub button', async ({ page, request }) => {
  const presetsRes = await request.get(`${apiBase}/api/library?category=look_preset&limit=40`);
  const items = ((await presetsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  const target = items.find((item) => item.payload?.seed_id === 'look-steady-voice');
  expect(target).toBeTruthy();

  const originalPayload = { ...(target!.payload || {}) };
  await request.put(`${apiBase}/api/library/${target!.id}`, {
    data: {
      payload: {
        ...originalPayload,
        registry_version: '2025.01',
      },
    },
  });

  try {
    await page.goto('/assets?tab=look_preset');
    await expect(page.getByTestId(`look-preset-stale-${target!.id}`)).toBeVisible();
    await page.getByTestId('look-preset-sync-all').click();
    await expect(page.getByTestId('look-preset-sync-msg')).toContainText(/同步|最新/, { timeout: 10_000 });
    await expect(page.getByTestId(`look-preset-stale-${target!.id}`)).toBeHidden({ timeout: 10_000 });
  } finally {
    await request.put(`${apiBase}/api/library/${target!.id}`, {
      data: { payload: originalPayload },
    });
  }
});

test('motion panel shows custom badge for brand-recommended library presets', async ({ page, request }) => {
  test.setTimeout(60_000);

  const created = await request.post(`${apiBase}/api/library`, {
    data: {
      category: 'look_preset',
      name: `E2E 动效自定义角标 ${Date.now()}`,
      payload: {
        subtitle_style_id: 'hf-caption-pop',
        transition_type: 'hf-push-up',
        transition_duration: 0.5,
        hf_overlays: [{ type: 'hf-color-grade', enabled: true, grade_warmth: 0.62, grade_strength: 0.3 }],
        pipeline_required: 'template_editor',
        registry_version: '2026.06.3',
      },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const preset = await created.json() as LibraryItem;

  const brandsRes = await request.get(`${apiBase}/api/library?category=brand&limit=5`);
  const brands = ((await brandsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  expect(brands.length).toBeGreaterThan(0);
  const brand = brands[0];
  const originalPayload = { ...(brand.payload || {}) };

  const brandPayload = {
    ...originalPayload,
    category: '大促',
    default_look_preset_library_id: preset.id,
    recommended_look_preset_library_ids: [preset.id],
  };
  await request.put(`${apiBase}/api/library/${brand.id}`, { data: { payload: brandPayload } });

  const template = await createE2eTemplate(request);
  const templateGet = await request.get(`${apiBase}/api/templates/${template.id}`);
  const dsl = ((await templateGet.json()) as { dsl_json: Record<string, unknown> }).dsl_json;

  await request.put(`${apiBase}/api/templates/${template.id}`, {
    data: {
      dsl_json: {
        ...dsl,
        globalConfig: {
          ...((dsl.globalConfig || {}) as Record<string, unknown>),
          brand_pack_id: brand.id,
          brand_pack: brandPayload,
        },
      },
    },
  });

  try {
    await page.addInitScript(() => {
      localStorage.setItem('guide-editor-brand-prompted', '1');
    });
    await page.goto(`/editor/${template.id}`);
    await page.getByTestId('inspector-tab-motion').click();
    await expect(page.getByTestId(`motion-preset-custom-${preset.id}`)).toBeVisible();
    await expect(page.getByTestId(`motion-preset-apply-${preset.id}`)).toBeVisible();
  } finally {
    await request.delete(`${apiBase}/api/library/${preset.id}`);
    await request.put(`${apiBase}/api/library/${brand.id}`, { data: { payload: originalPayload } });
  }
});

test('applying stale seeded preset auto-migrates in motion panel', async ({ page, request }) => {
  test.setTimeout(60_000);

  const presetsRes = await request.get(`${apiBase}/api/library?category=look_preset&limit=40`);
  const items = ((await presetsRes.json()) as { items?: LibraryItem[] }).items ?? [];
  const seeded = items.find((item) => item.payload?.seed_id === 'look-promo-fast');
  expect(seeded).toBeTruthy();

  const originalPayload = { ...(seeded!.payload || {}) };
  await request.put(`${apiBase}/api/library/${seeded!.id}`, {
    data: {
      payload: {
        ...originalPayload,
        registry_version: '2025.01',
        transition_type: 'hf-dissolve',
      },
    },
  });

  try {
    const template = await createE2eTemplate(request);
    await page.addInitScript(() => {
      localStorage.setItem('guide-editor-brand-prompted', '1');
    });
    await page.goto(`/editor/${template.id}`);
    await expect(page.getByLabel('项目名称')).toBeVisible();

    await page.getByTestId('inspector-tab-motion').click();
    await page.getByTestId('motion-preset-apply-look-promo-fast').click();
    await expect(page.getByTestId('look-preset-migration-note')).toBeVisible();
    await expect(page.getByTestId('segment-transition-type')).toHaveValue('hf-push-up');
  } finally {
    await request.put(`${apiBase}/api/library/${seeded!.id}`, {
      data: { payload: originalPayload },
    });
  }
});