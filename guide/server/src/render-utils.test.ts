import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PIPELINES,
  RENDER_STATUSES,
  enrichJob,
  getPipeline,
  isHeartbeatStale,
  enrichDslWithJobContext,
  materializeRenderDsl,
  outputExists,
  parseHeartbeatMs,
  redactProviderConfigSnapshot,
  shouldTimeoutJob,
  statusFromStage,
  validateInputMode,
  validatePipeline,
  validateProgress,
  validateRenderLogLevel,
  validateRenderStatus,
} from './render-utils.js';

describe('render-utils', () => {
  it('exposes production pipeline metadata', () => {
    assert.deepEqual(PIPELINES.map((pipeline) => pipeline.key), [
      'standard',
      'digital_human',
      'ai_full_auto',
      'template_editor',
      'asset_driven',
      'avatar_talk',
    ]);
    assert.equal(getPipeline('standard')?.requires_digital_human, false);
    assert.equal(getPipeline('digital_human')?.requires_digital_human, true);
  });

  it('validates pipeline keys strictly', () => {
    assert.equal(validatePipeline('standard'), true);
    assert.equal(validatePipeline('digital_human'), true);
    assert.equal(validatePipeline('image_to_video'), false);
    assert.equal(validatePipeline(''), false);
  });

  it('validates render input modes strictly', () => {
    assert.equal(validateInputMode('template'), true);
    assert.equal(validateInputMode('topic'), true);
    assert.equal(validateInputMode('script'), true);
    assert.equal(validateInputMode('batch'), false);
  });

  it('validates worker update fields without relying on sqlite constraints', () => {
    assert.ok(RENDER_STATUSES.includes('completed'));
    assert.equal(validateRenderStatus('video_gen'), true);
    assert.equal(validateRenderStatus('rendering'), false);
    assert.equal(validateRenderStatus(undefined), false);
    assert.equal(validateProgress(0), true);
    assert.equal(validateProgress(100), true);
    assert.equal(validateProgress(101), false);
    assert.equal(validateProgress(Number.NaN), false);
    assert.equal(validateProgress('50'), false);
    assert.equal(validateRenderLogLevel('warn'), true);
    assert.equal(validateRenderLogLevel('debug'), false);
  });

  it('maps pipeline progress stages to persisted render statuses', () => {
    assert.equal(statusFromStage('setup'), 'parsing');
    assert.equal(statusFromStage('parsing'), 'parsing');
    assert.equal(statusFromStage('scene_gen'), 'scene_gen');
    assert.equal(statusFromStage('video_gen'), 'video_gen');
    assert.equal(statusFromStage('assemble'), 'ffmpeg');
    assert.equal(statusFromStage('ffmpeg'), 'ffmpeg');
    assert.equal(statusFromStage('completed'), undefined);
    assert.equal(statusFromStage('failed'), undefined);
  });

  it('detects local and remote render outputs without throwing on missing files', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'render-utils-'));
    mkdirSync(join(dataDir, 'renders', 'job_1'), { recursive: true });
    writeFileSync(join(dataDir, 'renders', 'job_1', 'final.mp4'), 'fake');

    assert.equal(outputExists('/renders/job_1/final.mp4', dataDir), true);
    assert.equal(outputExists('/renders/job_2/final.mp4', dataDir), false);
    assert.equal(outputExists('https://cdn.example.com/final.mp4', dataDir), true);
    assert.equal(outputExists('', dataDir), false);
  });

  it('adds output_exists to jobs while preserving source fields', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'render-utils-'));
    const job = {
      id: 'job-1',
      status: 'completed',
      output_url: 'https://cdn.example.com/final.mp4',
      provider_config_snapshot: JSON.stringify({ models: { kie: { api_key: 'kie-secret-abcdef' } } }),
    };
    assert.deepEqual(enrichJob(job, dataDir), {
      ...job,
      error_message: '',
      error_code: null,
      provider_config_snapshot: JSON.stringify({ models: { kie: { api_key: 'kie-se***' } } }),
      output_exists: true,
    });
    assert.equal(enrichJob(undefined, dataDir), undefined);
  });

  it('redacts provider config snapshots recursively', () => {
    const redacted = redactProviderConfigSnapshot({
      models: {
        kie: { api_key: 'kie-secret-123456', base_url: 'https://kie.example' },
        nested: { token: 'token-secret-abcdef' },
      },
    }) as any;

    assert.equal(redacted.models.kie.api_key, 'kie-se***');
    assert.equal(redacted.models.kie.base_url, 'https://kie.example');
    assert.equal(redacted.models.nested.token, 'token-***');
  });

  it('detects stale active worker heartbeats without touching terminal jobs', () => {
    const now = Date.parse('2026-06-14T10:20:00Z');
    assert.equal(parseHeartbeatMs('2026-06-14 10:00:00'), Date.parse('2026-06-14T10:00:00Z'));
    assert.equal(isHeartbeatStale('2026-06-14T10:00:00Z', now, 10 * 60 * 1000), true);
    assert.equal(isHeartbeatStale('2026-06-14T10:15:00Z', now, 10 * 60 * 1000), false);
    assert.equal(isHeartbeatStale('', now, 10 * 60 * 1000), false);
    assert.equal(shouldTimeoutJob({ status: 'video_gen', heartbeat_at: '2026-06-14 10:00:00' }, now, 10 * 60 * 1000), true);
    assert.equal(shouldTimeoutJob({ status: 'completed', heartbeat_at: '2026-06-14 10:00:00' }, now, 10 * 60 * 1000), false);
    assert.equal(shouldTimeoutJob({ status: 'queued', heartbeat_at: '2026-06-14 10:00:00' }, now, 10 * 60 * 1000), false);
  });

  it('materializes script and topic inputs into render-specific DSL', () => {
    const templateDsl = {
      meta: { name: 'Base' },
      globalConfig: { fps: 30 },
      variables: [],
      segments: [
        {
          id: 'base-1',
          type: 'narration',
          narration_text: '',
          duration_sec: 5,
          scene_description: '',
          subtitle: { enabled: true, style_id: 'default', position: 'bottom', animation: 'fadeIn' },
          transition: { type: 'none', duration: 0.5 },
          digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          overlays: [],
        },
      ],
    };

    const scriptDsl = materializeRenderDsl(
      templateDsl,
      'script',
      '',
      '第一段介绍产品价值。\n第二段解释使用场景。',
    ) as any;
    assert.equal(scriptDsl.meta.input_mode, 'script');
    assert.equal(scriptDsl.segments.length, 2);
    assert.equal(scriptDsl.segments[0].narration_text, '第一段介绍产品价值。');
    assert.equal(scriptDsl.segments[1].narration_text, '第二段解释使用场景。');
    assert.match(scriptDsl.segments[0].diagnostics.at(-1), /固定脚本模式/);

    const topicDsl = materializeRenderDsl(templateDsl, 'topic', '销售培训', '') as any;
    assert.equal(topicDsl.meta.input_mode, 'topic');
    assert.equal(topicDsl.segments.length, 4);
    assert.match(topicDsl.segments[0].narration_text, /销售培训/);
    assert.match(topicDsl.segments[0].diagnostics.at(-1), /主题模式/);
  });

  it('enriches DSL with digital human catalog and enables narration segments', () => {
    const dsl = {
      meta: { name: 'Demo' },
      globalConfig: { subtitle_style: 'bold-yellow' },
      segments: [
        {
          type: 'narration',
          narration_text: '测试口播',
          digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          subtitle: { enabled: true, style_id: 'default', position: 'bottom', animation: 'fadeIn' },
        },
      ],
    };
    const enriched = enrichDslWithJobContext(
      dsl,
      { digital_human_id: 'dh-1', pipeline_key: 'digital_human' },
      {
        id: 'dh-1',
        name: '导购员',
        face_photo_url: '/uploads/face.png',
        half_body_photo_url: '/uploads/half.png',
      },
    ) as any;
    assert.equal(enriched.meta.digital_human_id, 'dh-1');
    assert.equal(enriched.segments[0].avatar_id, 'dh-1');
    assert.equal(enriched.segments[0].digital_human.enabled, true);
    assert.equal(enriched.globalConfig.digital_human_catalog['dh-1'].face_photo_url, '/uploads/face.png');
  });

  it('splits long Chinese script paragraphs by sentence without requiring spaces', () => {
    const templateDsl = {
      meta: { name: 'Base' },
      globalConfig: {},
      variables: [],
      segments: [{ narration_text: '', duration_sec: 5, overlays: [] }],
    };
    const longScript = [
      '第一段介绍品牌背景和用户痛点，让观众快速理解为什么需要这个方案。',
      '第二段解释核心能力和使用流程，强调它如何降低沟通成本并提升执行效率。',
      '第三段展示典型场景和结果反馈，让团队可以把复杂信息转成清晰行动。',
      '第四段用明确的行动号召收尾，引导观众继续咨询或立即开始试用。',
    ].join('').repeat(2);

    const scriptDsl = materializeRenderDsl(templateDsl, 'script', '', longScript) as any;

    assert.equal(scriptDsl.meta.input_mode, 'script');
    assert.ok(scriptDsl.segments.length > 1);
    assert.match(scriptDsl.segments[0].narration_text, /第一段介绍品牌背景/);
    assert.match(scriptDsl.segments.at(-1).narration_text, /立即开始试用/);
    assert.ok(scriptDsl.segments.every((segment: any) => segment.narration_text.length <= 180));
  });
});
