import { Router } from 'express';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { getDataDir } from '../db/database.js';
import { getLlmDisplayInfo } from '../llmClient.js';

const router = Router();
function getConfigPath() {
  return join(getDataDir(), 'config.json');
}

interface Config {
  models: {
    kie: { base_url: string; api_key: string; model: string; aspect_ratio: string; resolution: string; poll_timeout: number };
    yuntts: { base_url: string; api_key: string; default_voice: string; max_audio_duration: number };
    wavespeed: { base_url: string; api_key: string; resolution: string };
    ffmpeg: { codec: string; preset: string; crf: number; audio_bitrate: string };
    llm: { base_url: string; api_key: string; model: string };
  };
  prompts: {
    scene_image_default: string;
    human_model: string;
    edge_tts_voice: string;
  };
  pipeline: {
    poll_interval: number;
    tts_speed_threshold: number;
    ken_burns_zoom_start: number;
    ken_burns_zoom_end: number;
    timeline_validate: boolean;
    timeline_validate_strict: boolean;
    subtitle_aligner: 'whisper' | 'heuristic';
    whisper_model: string;
  };
}

const DEFAULT_CONFIG: Config = {
  models: {
    kie: { base_url: 'https://api.kie.ai', api_key: '', model: 'gpt-image-2-image-to-image', aspect_ratio: '9:16', resolution: '2K', poll_timeout: 300 },
    yuntts: { base_url: 'https://www.yuntts.com/api/v1', api_key: 'sk-', default_voice: 'zh-CN-XiaoxiaoNeural', max_audio_duration: 28 },
    wavespeed: { base_url: 'https://api.wavespeed.ai', api_key: '', resolution: '480p' },
    ffmpeg: { codec: 'libx264', preset: 'veryfast', crf: 18, audio_bitrate: '192k' },
    llm: { base_url: 'https://api.openai.com/v1', api_key: '', model: 'gpt-4o-mini' },
  },
  prompts: {
    scene_image_default: '将这张场景参考图与人物融合，生成一个真实自然的导购场景图',
    human_model: '生成一张高质量的人物形象照，背景干净，适合作为数字人形象',
    edge_tts_voice: 'zh-CN-XiaoxiaoNeural',
  },
  pipeline: {
    poll_interval: 3,
    tts_speed_threshold: 1.1,
    ken_burns_zoom_start: 1.0,
    ken_burns_zoom_end: 1.15,
    timeline_validate: true,
    timeline_validate_strict: false,
    subtitle_aligner: 'whisper',
    whisper_model: 'base',
  },
};

function loadConfig(): Config {
  try {
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...saved,
        models: { ...DEFAULT_CONFIG.models, ...saved.models, llm: { ...DEFAULT_CONFIG.models.llm, ...saved.models?.llm } },
        prompts: { ...DEFAULT_CONFIG.prompts, ...saved.prompts },
        pipeline: { ...DEFAULT_CONFIG.pipeline, ...saved.pipeline },
      };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(config: Config) {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

function hasUsableApiKey(value: string | undefined): boolean {
  const key = String(value || '').trim();
  return key.length > 8 && !key.includes('***');
}

function ffmpegAvailable(): boolean {
  const result = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8', timeout: 1500 });
  return result.status === 0;
}

function buildDiagnostics(config: Config) {
  const providers = {
    kie: {
      key: 'kie',
      name: 'KIE 场景图',
      configured: hasUsableApiKey(config.models.kie.api_key),
      base_url: config.models.kie.base_url,
      used_for: ['standard'],
      fallback: '缺失时会跳过 AI 场景图，改用参考图或占位画面。',
    },
    yuntts: {
      key: 'yuntts',
      name: 'YunTTS 语音',
      configured: hasUsableApiKey(config.models.yuntts.api_key),
      base_url: config.models.yuntts.base_url,
      used_for: ['standard', 'digital_human'],
      fallback: '缺失时会尝试 Edge TTS 或静音/占位路径。',
    },
    wavespeed: {
      key: 'wavespeed',
      name: 'WaveSpeed 口型/数字人视频',
      configured: hasUsableApiKey(config.models.wavespeed.api_key),
      base_url: config.models.wavespeed.base_url,
      used_for: ['standard', 'digital_human'],
      fallback: '缺失时会跳过口型视频，退回图片动效或占位视频。',
    },
    ffmpeg: {
      key: 'ffmpeg',
      name: 'FFmpeg 合成',
      configured: ffmpegAvailable(),
      base_url: 'local binary',
      used_for: ['standard', 'digital_human'],
      fallback: '必需依赖，缺失会导致渲染失败。',
    },
    llm: (() => {
      const llm = getLlmDisplayInfo();
      return {
        key: 'llm',
        name: 'LLM 文本润色',
        configured: llm.configured,
        base_url: llm.base_url,
        model: llm.model,
        source: llm.source,
        used_for: llm.used_for,
        fallback: '未配置时润色口播回退为规则模板。',
      };
    })(),
  };

  const providerList = Object.values(providers);
  const pipelineStatus = {
    standard: {
      blockers: providers.ffmpeg.configured ? [] : ['FFmpeg 不可用，无法合成最终视频'],
      warnings: [
        !providers.kie.configured ? 'KIE API key 缺失：场景图会降级为参考图/占位图' : '',
        !providers.yuntts.configured ? 'YunTTS API key 缺失：语音会尝试 Edge TTS 或降级' : '',
        !providers.wavespeed.configured ? 'WaveSpeed API key 缺失：口型视频会降级为图片动效' : '',
      ].filter(Boolean),
      provider_keys: ['kie', 'yuntts', 'wavespeed', 'ffmpeg'],
    },
    digital_human: {
      blockers: providers.ffmpeg.configured ? [] : ['FFmpeg 不可用，无法合成最终视频'],
      warnings: [
        !providers.yuntts.configured ? 'YunTTS API key 缺失：数字人口播语音可能降级' : '',
        !providers.wavespeed.configured ? 'WaveSpeed API key 缺失：数字人口型视频会降级' : '',
      ].filter(Boolean),
      provider_keys: ['yuntts', 'wavespeed', 'ffmpeg'],
    },
  };

  return {
    data_dir: getDataDir(),
    providers: providerList,
    pipelines: pipelineStatus,
  };
}

// GET /api/config — 获取完整配置
router.get('/', (_req, res) => {
  const config = loadConfig();
  // 隐藏 API key 明文
  const masked = JSON.parse(JSON.stringify(config));
  if (masked.models.kie.api_key) masked.models.kie.api_key = masked.models.kie.api_key.slice(0, 6) + '***';
  if (masked.models.yuntts.api_key) masked.models.yuntts.api_key = masked.models.yuntts.api_key.slice(0, 6) + '***';
  if (masked.models.wavespeed.api_key) masked.models.wavespeed.api_key = masked.models.wavespeed.api_key.slice(0, 6) + '***';
  if (masked.models.llm?.api_key) masked.models.llm.api_key = masked.models.llm.api_key.slice(0, 6) + '***';
  const llmRuntime = getLlmDisplayInfo();
  res.json({
    ...masked,
    llm_runtime: llmRuntime,
  });
});

// GET /api/config/diagnostics — provider readiness without exposing secrets
router.get('/diagnostics', (_req, res) => {
  res.json(buildDiagnostics(loadConfig()));
});

// PUT /api/config — 保存完整配置
router.put('/', (req, res) => {
  try {
    const incoming = req.body as Partial<Config>;
    const current = loadConfig();

    // 合并配置，保留未提交的字段
    const merged: Config = {
      models: {
        kie: { ...current.models.kie, ...incoming.models?.kie },
        yuntts: { ...current.models.yuntts, ...incoming.models?.yuntts },
        wavespeed: { ...current.models.wavespeed, ...incoming.models?.wavespeed },
        ffmpeg: { ...current.models.ffmpeg, ...incoming.models?.ffmpeg },
        llm: { ...current.models.llm, ...incoming.models?.llm },
      },
      prompts: { ...current.prompts, ...incoming.prompts },
      pipeline: { ...current.pipeline, ...incoming.pipeline },
    };

    // 不覆盖 masked key
    if (incoming.models?.kie?.api_key && !incoming.models.kie.api_key.includes('***')) {
      merged.models.kie.api_key = incoming.models.kie.api_key;
    } else { merged.models.kie.api_key = current.models.kie.api_key; }

    if (incoming.models?.yuntts?.api_key && !incoming.models.yuntts.api_key.includes('***')) {
      merged.models.yuntts.api_key = incoming.models.yuntts.api_key;
    } else { merged.models.yuntts.api_key = current.models.yuntts.api_key; }

    if (incoming.models?.wavespeed?.api_key && !incoming.models.wavespeed.api_key.includes('***')) {
      merged.models.wavespeed.api_key = incoming.models.wavespeed.api_key;
    } else { merged.models.wavespeed.api_key = current.models.wavespeed.api_key; }

    if (incoming.models?.llm?.api_key && !incoming.models.llm.api_key.includes('***')) {
      merged.models.llm.api_key = incoming.models.llm.api_key;
    } else { merged.models.llm.api_key = current.models.llm.api_key; }

    saveConfig(merged);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/config/:section — 按模块更新
router.patch('/:section', (req, res) => {
  try {
    const section = req.params.section as keyof Config;
    const current = loadConfig();
    if (!(section in current)) return res.status(400).json({ error: `Unknown section: ${section}` });

    (current as any)[section] = { ...(current as any)[section], ...req.body };
    saveConfig(current);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
