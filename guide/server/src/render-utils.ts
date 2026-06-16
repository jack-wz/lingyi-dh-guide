import { existsSync } from 'fs';
import { join } from 'path';

export interface PipelineOption {
  key: string;
  name: string;
  description: string;
  requires_digital_human: boolean;
}

export const PIPELINES: PipelineOption[] = [
  { key: 'standard', name: '标准', description: '模板解析 → 场景图 → 分镜视频 → FFmpeg 组装', requires_digital_human: false },
  { key: 'digital_human', name: '数字人口播', description: '跳过场景图，直接用数字人口播视频', requires_digital_human: true },
  { key: 'ai_full_auto', name: 'AI 全自动', description: 'LLM 根据主题/脚本自动生成完整分镜并渲染', requires_digital_human: true },
  { key: 'template_editor', name: '模板编辑器', description: '精确渲染当前编辑器中编排的模板内容', requires_digital_human: false },
  { key: 'asset_driven', name: '素材驱动', description: '根据上传素材列表自动分镜并生成口播视频', requires_digital_human: true },
  { key: 'avatar_talk', name: '数字人对口播', description: '通过 AvatarAdapter 统一接口生成唇形同步视频', requires_digital_human: true },
];

export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];
export const ACTIVE_RENDER_STATUSES = ['parsing', 'scene_gen', 'video_gen', 'ffmpeg', 'cancelling'];
export const RENDER_STATUSES = ['queued', ...ACTIVE_RENDER_STATUSES, ...TERMINAL_STATUSES];
export const RENDER_LOG_LEVELS = ['info', 'warn', 'error'];

export function validatePipeline(pipelineKey: string) {
  return PIPELINES.some((p) => p.key === pipelineKey);
}

export function getPipeline(pipelineKey: string) {
  return PIPELINES.find((p) => p.key === pipelineKey);
}

export function validateRenderStatus(status: unknown): status is string {
  return typeof status === 'string' && RENDER_STATUSES.includes(status);
}

export function validateRenderLogLevel(level: unknown): level is string {
  return typeof level === 'string' && RENDER_LOG_LEVELS.includes(level);
}

export function validateProgress(progress: unknown): progress is number {
  return typeof progress === 'number' && Number.isFinite(progress) && progress >= 0 && progress <= 100;
}

export function statusFromStage(stage: unknown): string | undefined {
  if (stage === 'setup') return 'parsing';
  if (stage === 'assemble') return 'ffmpeg';
  if (typeof stage === 'string' && ACTIVE_RENDER_STATUSES.includes(stage) && stage !== 'cancelling') {
    return stage;
  }
  return undefined;
}

export function outputExists(outputUrl: string | null | undefined, dataDir: string): boolean {
  if (!outputUrl) return false;
  if (outputUrl.startsWith('/renders/')) {
    return existsSync(join(dataDir, 'renders', outputUrl.slice('/renders/'.length)));
  }
  return outputUrl.startsWith('http://') || outputUrl.startsWith('https://');
}

function maskSecret(value: unknown) {
  const text = String(value || '');
  return text ? `${text.slice(0, 6)}***` : '';
}

export function redactProviderConfigSnapshot(snapshot: unknown): unknown {
  if (!snapshot) return snapshot;
  if (typeof snapshot === 'string') {
    try {
      return JSON.stringify(redactProviderConfigSnapshot(JSON.parse(snapshot)));
    } catch {
      return snapshot;
    }
  }
  if (Array.isArray(snapshot)) {
    return snapshot.map((item) => redactProviderConfigSnapshot(item));
  }
  if (typeof snapshot === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(snapshot as Record<string, unknown>)) {
      if (/api[_-]?key|token|secret/i.test(key)) {
        redacted[key] = maskSecret(value);
      } else {
        redacted[key] = redactProviderConfigSnapshot(value);
      }
    }
    return redacted;
  }
  return snapshot;
}

function parseStoredError(errorMessage: string): { error_code: string | null; error_message: string } {
  const raw = String(errorMessage || '').trim();
  const match = raw.match(/^\[([A-Z][A-Z0-9_]*)\]\s*(.*)$/s);
  if (match) {
    return { error_code: match[1], error_message: match[2] || raw };
  }
  return { error_code: null, error_message: raw };
}

export function enrichJob<T extends Record<string, unknown>>(
  job: T | undefined,
  dataDir: string,
): (T & { output_exists: boolean; error_code: string | null }) | undefined {
  if (!job) return undefined;
  const outputUrl = typeof job.output_url === 'string' ? job.output_url : undefined;
  const parsed = parseStoredError(String(job.error_message || ''));
  return {
    ...job,
    error_message: parsed.error_message,
    error_code: parsed.error_code,
    provider_config_snapshot: redactProviderConfigSnapshot(job.provider_config_snapshot),
    output_exists: outputExists(outputUrl, dataDir),
  };
}

export function parseHeartbeatMs(heartbeatAt: unknown): number | null {
  if (typeof heartbeatAt !== 'string' || !heartbeatAt.trim()) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(heartbeatAt)
    ? `${heartbeatAt.replace(' ', 'T')}Z`
    : heartbeatAt;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isHeartbeatStale(
  heartbeatAt: unknown,
  nowMs = Date.now(),
  timeoutMs = 10 * 60 * 1000,
): boolean {
  const heartbeatMs = parseHeartbeatMs(heartbeatAt);
  if (heartbeatMs === null) return false;
  return nowMs - heartbeatMs > timeoutMs;
}

export function shouldTimeoutJob<T extends { status?: unknown; heartbeat_at?: unknown }>(
  job: T,
  nowMs = Date.now(),
  timeoutMs = 10 * 60 * 1000,
): boolean {
  return (
    typeof job.status === 'string' &&
    ACTIVE_RENDER_STATUSES.includes(job.status) &&
    isHeartbeatStale(job.heartbeat_at, nowMs, timeoutMs)
  );
}

export type RenderInputMode = 'template' | 'topic' | 'script';

export function validateInputMode(inputMode: string): inputMode is RenderInputMode {
  return ['template', 'topic', 'script'].includes(inputMode);
}

function splitScriptIntoBlocks(scriptText: string): string[] {
  const splitLongBlock = (part: string): string[] => {
    if (part.length <= 180) return [part];
    const sentences = (part.match(/[^。！？.!?\n]+[。！？.!?]?/g) || [])
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    if (sentences.length <= 1) {
      const chunks: string[] = [];
      for (let index = 0; index < part.length; index += 180) {
        chunks.push(part.slice(index, index + 180).trim());
      }
      return chunks.filter(Boolean);
    }

    const blocks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      const candidate = `${current}${sentence}`;
      if (candidate.length <= 180 || !current) {
        current = candidate;
      } else {
        blocks.push(current);
        current = sentence;
      }
    }
    if (current) blocks.push(current);
    return blocks;
  };

  return scriptText
    .split(/\n{2,}|\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap(splitLongBlock)
    .slice(0, 20);
}

function estimateNarrationDuration(text: string): number {
  const normalized = text.replace(/\s+/g, '');
  const cjkChars = (normalized.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinWords = (text.match(/[A-Za-z0-9]+/g) || []).length;
  const estimatedSeconds = cjkChars > 0
    ? Math.ceil(cjkChars / 5)
    : Math.ceil(latinWords / 2.5);
  return Math.max(4, Math.min(14, estimatedSeconds || 5));
}

function cloneSegmentTemplate(templateDsl: Record<string, any>, index: number) {
  const source = Array.isArray(templateDsl.segments) && templateDsl.segments.length > 0
    ? templateDsl.segments[Math.min(index, templateDsl.segments.length - 1)]
    : {};
  return {
    id: `generated-${index + 1}`,
    type: 'narration',
    narration_text: '',
    duration_sec: 5,
    scene_image_url: '',
    scene_description: '',
    camera_shot: '',
    segment_bgm_url: '',
    subtitle: { enabled: true, style_id: 'default', position: 'bottom', animation: 'fadeIn' },
    transition: { type: 'none', duration: 0.5 },
    digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
    overlays: [],
    thumbnail_url: '',
    diagnostics: [],
    layout: 'avatar-center',
    avatar_id: '',
    voice_id: '',
    objects: [],
    ...source,
  };
}

function topicDraftSegments(topic: string): string[] {
  const cleanTopic = topic.trim();
  return [
    `欢迎了解${cleanTopic}。这支视频会用清晰的节奏介绍核心背景和价值。`,
    `${cleanTopic}的关键问题通常来自信息不清、流程分散和执行成本偏高。`,
    `我们会把${cleanTopic}拆成可理解的场景，帮助观众快速判断重点和下一步行动。`,
    `最后，用一个明确的总结收束${cleanTopic}，引导观众继续咨询或开始试用。`,
  ];
}

export function materializeRenderDsl(
  templateDsl: unknown,
  inputMode: RenderInputMode,
  topic = '',
  scriptText = '',
) {
  const dsl = typeof templateDsl === 'object' && templateDsl !== null
    ? JSON.parse(JSON.stringify(templateDsl))
    : {};

  if (inputMode === 'template') return dsl;

  const sourceTexts = inputMode === 'script'
    ? splitScriptIntoBlocks(scriptText)
    : topicDraftSegments(topic);

  const now = new Date().toISOString();
  dsl.meta = {
    ...(dsl.meta || {}),
    input_mode: inputMode,
    source_topic: topic,
    source_script_text: inputMode === 'script' ? scriptText : '',
    updated_at: now,
    updatedAt: now,
  };
  dsl.variables = Array.isArray(dsl.variables) ? dsl.variables : [];
  dsl.globalConfig = dsl.globalConfig || {};
  dsl.segments = sourceTexts.map((text, index) => {
    const segment = cloneSegmentTemplate(dsl, index);
    return {
      ...segment,
      id: `generated-${inputMode}-${index + 1}`,
      index,
      narration_text: text,
      duration_sec: estimateNarrationDuration(text),
      scene_description: segment.scene_description || (inputMode === 'topic'
        ? `${topic.trim()} - scene ${index + 1}`
        : text.slice(0, 120)),
      diagnostics: [
        ...(Array.isArray(segment.diagnostics) ? segment.diagnostics : []),
        inputMode === 'topic' ? '由主题模式生成的初始分镜草稿' : '由固定脚本模式拆分生成',
      ],
    };
  });

  return dsl;
}
