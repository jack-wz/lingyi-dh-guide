export type PreviewRenderTier = 'exact' | 'layout' | 'approximate';

const PIPELINE_LABELS: Record<string, string> = {
  template_editor: '模板编辑器',
  hyperframes_template: 'HyperFrames 模板',
  digital_human: '数字人口播',
  standard: '标准',
};

export function getPipelineDisplayName(key: string | undefined): string {
  if (!key) return '未选择';
  return PIPELINE_LABELS[key] || key;
}

export function getPreviewRenderAlignment(pipelineKey: string | undefined): {
  tier: PreviewRenderTier;
  title: string;
  detail: string;
  recommendPipeline?: string;
} {
  switch (pipelineKey) {
    case 'hyperframes_template':
      return {
        tier: 'exact',
        title: '与画布预览一致',
        detail: '使用与编辑器相同的 HyperFrames HTML 合成成片，图层、字幕与对象位置最接近实时预览。',
      };
    case 'template_editor':
      return {
        tier: 'layout',
        title: '流程与预览一致',
        detail: '按标准四阶段生成场景与口播视频，FFmpeg 单路径合成（ASS 字幕、xfade 转场、质感滤镜）；画面来自 AI 场景与数字人。HF 预览用于核对版式，复杂动效以 FFmpeg 交付为准。',
      };
    case 'digital_human':
    case 'avatar_talk':
      return {
        tier: 'approximate',
        title: '预览为编排示意',
        detail: '画布预览展示排版与品牌样式；成片由数字人/唇形供应商生成，口型与分镜视频与预览时间轴可能不完全一致。',
        recommendPipeline: 'template_editor',
      };
    case 'standard':
    case 'ai_full_auto':
    case 'asset_driven':
      return {
        tier: 'approximate',
        title: '预览为编排示意',
        detail: '预览用于检查版式与文案；成片会经过场景生成、TTS 与视频合成，画面内容可能与预览不同。',
        recommendPipeline: 'template_editor',
      };
    default:
      return {
        tier: 'layout',
        title: '预览供编排参考',
        detail: '提交前建议用「成片预览」模式播放时间轴，并打开 HyperFrames 新标签预览核对版式。',
      };
  }
}