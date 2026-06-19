export interface PipelineOption {
  key: string;
  name: string;
  description: string;
  requires_digital_human: boolean;
}

/** Full pipeline registry (server validation metadata + worker registration). */
export const PIPELINES: PipelineOption[] = [
  {
    key: 'standard',
    name: '标准',
    description: '模板解析 → 场景图 → 分镜视频 → FFmpeg 组装',
    requires_digital_human: false,
  },
  {
    key: 'digital_human',
    name: '数字人口播',
    description: '跳过场景图，直接用数字人口播视频',
    requires_digital_human: true,
  },
  {
    key: 'ai_full_auto',
    name: 'AI 全自动',
    description: 'LLM 根据主题/脚本自动生成完整分镜并渲染',
    requires_digital_human: true,
  },
  {
    key: 'template_editor',
    name: '模板编辑器',
    description: '精确渲染当前编辑器中编排的模板内容',
    requires_digital_human: false,
  },
  {
    key: 'hyperframes_template',
    name: 'HyperFrames 模板',
    description: '使用 HyperFrames HTML 精确渲染当前编辑器图层和字幕',
    requires_digital_human: false,
  },
  {
    key: 'asset_driven',
    name: '素材驱动',
    description: '根据上传素材列表自动分镜并生成口播视频',
    requires_digital_human: true,
  },
  {
    key: 'avatar_talk',
    name: '数字人对口播',
    description: '通过 AvatarAdapter 统一接口生成唇形同步视频',
    requires_digital_human: true,
  },
];

const HIDDEN_UNTIL_ENABLED = new Set(['hyperframes_template']);

function readEnvFlag(name: string): string | undefined {
  const runtime = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[name];
}

export function isHyperframesTemplatePipelineEnabled(): boolean {
  return readEnvFlag('ENABLE_HF_TEMPLATE_PIPELINE') === '1';
}

/** Pipelines exposed in UI / render API (Phase J enables hyperframes_template). */
export function getExposedPipelines(): PipelineOption[] {
  if (isHyperframesTemplatePipelineEnabled()) {
    return PIPELINES;
  }
  return PIPELINES.filter((pipeline) => !HIDDEN_UNTIL_ENABLED.has(pipeline.key));
}

export function getPipeline(pipelineKey: string): PipelineOption | undefined {
  return PIPELINES.find((pipeline) => pipeline.key === pipelineKey);
}

export function validatePipelineKey(pipelineKey: string): boolean {
  return getExposedPipelines().some((pipeline) => pipeline.key === pipelineKey);
}