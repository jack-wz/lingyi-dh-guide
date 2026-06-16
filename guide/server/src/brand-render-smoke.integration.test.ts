import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

type JsonValue = Record<string, unknown> | unknown[];

let server: Server;
let baseUrl = '';
let closeDb: () => void;
let getDb: () => Database.Database;
let dataDir = '';

async function request(method: string, path: string, body?: JsonValue) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  return { status: res.status, json };
}

function seedBrandWithFont(db: Database.Database, fontFamily: string, fontFileName: string) {
  const brandId = randomUUID();
  const payload = {
    external_id: 'smoke:brand',
    brand_color: '#2563eb',
    background_color: '#f6f8fb',
    subtitle_style: 'default',
    tokens: {
      typography: {
        fonts: [{ name: fontFamily, family: fontFamily, url: `/uploads/fonts/${fontFileName}` }],
      },
    },
    frames: [{ id: 'intro', name: '开场', shotType: 'avatar_talking', duration: 5 }],
  };
  db.prepare(
    `INSERT INTO library_items (id, category, name, description, tags, file_url, parent_id, payload_json)
     VALUES (?, 'brand', ?, ?, '[]', '', NULL, ?)`,
  ).run(brandId, '冒烟品牌包', 'e2e smoke', JSON.stringify(payload));
  return brandId;
}

describe('brand render smoke integration', () => {
  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'brand-smoke-'));
    process.env.DATA_DIR = dataDir;
    process.env.DISABLE_RENDER_WORKER = '1';

    const guideRoot = join(import.meta.dirname, '../..');
    const sampleFont = [
      join(guideRoot, 'data/uploads/fonts/brand-DeyiHei.ttf'),
      join(guideRoot, 'data/uploads/fonts/brand-BiaoXiaoZhiBiaoTiHei.ttf'),
    ].find((p) => existsSync(p));

    if (sampleFont) {
      const uploadsFonts = join(dataDir, 'uploads', 'fonts');
      mkdirSync(uploadsFonts, { recursive: true });
      copyFileSync(sampleFont, join(uploadsFonts, 'brand-DeyiHei.ttf'));
    }

    const appModule = await import('./app.js');
    const dbModule = await import('./db/database.js');
    closeDb = dbModule.closeDb;
    getDb = dbModule.getDb;

    server = appModule.createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    closeDb();
  });

  it('hydrates brand pack on render claim when template only stores brand_pack_id', async () => {
    const db = getDb();
    const brandId = seedBrandWithFont(db, 'DeyiHei', 'brand-DeyiHei.ttf');

    const templateRes = await request('POST', '/api/templates', {
      name: 'Brand Smoke Template',
      type: 'smoke',
    });
    assert.equal(templateRes.status, 201);
    const templateId = (templateRes.json as { id: string }).id;

    const dsl = {
      meta: { name: 'Brand Smoke Template', type: 'smoke', pipeline_key: 'template_editor' },
      globalConfig: {
        canvas_width: 1080,
        canvas_height: 1920,
        fps: 30,
        brand_pack_id: brandId,
        brand_color: '#2563eb',
      },
      segments: [
        {
          id: 's1',
          type: 'narration',
          narration_text: '品牌字幕一致性冒烟测试。',
          duration_sec: 3,
          subtitle: { enabled: true, style_id: 'default', position: 'bottom', animation: 'fadeIn' },
          transition: { type: 'none', duration: 0.5 },
          digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          overlays: [],
          objects: [],
        },
      ],
      variables: [],
    };

    const putRes = await request('PUT', `/api/templates/${templateId}`, { dsl_json: dsl });
    assert.equal(putRes.status, 200);

    const renderRes = await request('POST', '/api/renders', {
      template_id: templateId,
      pipeline_key: 'template_editor',
      input_mode: 'template',
    });
    assert.equal(renderRes.status, 201);

    const claimed = await request('GET', '/api/renders/next?worker_id=brand-smoke-worker');
    assert.equal(claimed.status, 200);

    const job = claimed.json as {
      template_dsl: {
        globalConfig: {
          brand_pack?: { tokens?: { typography?: { fonts?: Array<{ family: string; url?: string }> } } };
          default_font_family?: string;
        };
      };
    };

    const fonts = job.template_dsl.globalConfig.brand_pack?.tokens?.typography?.fonts || [];
    assert.ok(fonts.length >= 1, 'claimed job should hydrate brand_pack fonts');
    assert.equal(fonts[0].family, 'DeyiHei');
    assert.match(String(fonts[0].url || ''), /\/uploads\/fonts\//);
    assert.equal(job.template_dsl.globalConfig.default_font_family, 'DeyiHei');
  });

  it('preview-html includes brand @font-face when only brand_pack_id is set', async () => {
    const db = getDb();
    const brandId = seedBrandWithFont(db, 'DeyiHei', 'brand-DeyiHei.ttf');

    const templateRes = await request('POST', '/api/templates', { name: 'HF Smoke', type: 'smoke' });
    const templateId = (templateRes.json as { id: string }).id;

    await request('PUT', `/api/templates/${templateId}`, {
      dsl_json: {
        meta: { name: 'HF Smoke', type: 'smoke' },
        globalConfig: { canvas_width: 1080, canvas_height: 1920, brand_pack_id: brandId },
        segments: [
          {
            id: 's1',
            narration_text: '预览字体测试',
            duration_sec: 3,
            subtitle: { enabled: true, style_id: 'default', position: 'bottom', animation: 'fadeIn' },
            transition: { type: 'none', duration: 0.5 },
            digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
            overlays: [],
          },
        ],
        variables: [],
      },
    });

    const preview = await fetch(`${baseUrl}/api/hyperframes/${templateId}/preview-html`);
    assert.equal(preview.status, 200);
    const html = await preview.text();
    assert.match(html, /@font-face/);
    assert.match(html, /DeyiHei/);
  });
});