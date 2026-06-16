export interface ShotCandidate {
  id: string;
  name: string;
  shotType?: string;
  description?: string;
  duration?: number;
}

export interface ShotRecommendation {
  id: string;
  name: string;
  score: number;
  reason: string;
}

export interface NlEditPatch {
  op: 'set';
  path: string;
  value: unknown;
}

const SHOT_HINTS: Array<{ pattern: RegExp; shotType: string; boost: number }> = [
  { pattern: /产品|卖点|展示/, shotType: 'product_showcase', boost: 4 },
  { pattern: /口播|讲解|介绍|导购/, shotType: 'avatar_talking', boost: 4 },
  { pattern: /结尾|引导|cta|行动/, shotType: 'closing', boost: 4 },
  { pattern: /开场|欢迎/, shotType: 'avatar_talking', boost: 2 },
];

export function polishScript(text: string, tone = '导购'): string {
  let out = text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/，+/g, '，')
    .replace(/。+/g, '。')
    .replace(/！+/g, '！')
    .replace(/？+/g, '？')
    .replace(/那个，/g, '')
    .replace(/然后呢，/g, '接下来，')
    .replace(/嗯+/g, '');

  if (tone === '导购' || tone === '专业') {
    out = out.replace(/你好/g, '您好');
    if (out && !/[。！？]$/.test(out)) out += '。';
  }

  return out;
}

export function recommendShots(
  sceneDescription: string,
  shots: ShotCandidate[],
  limit = 3,
): ShotRecommendation[] {
  const query = sceneDescription.trim().toLowerCase();
  if (!query || !shots.length) return [];

  const keywords = query.split(/[\s，。、；]+/).filter((w) => w.length >= 2);

  const scored = shots.map((shot) => {
    const hay = `${shot.name} ${shot.shotType || ''} ${shot.description || ''}`.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (hay.includes(kw)) score += 2;
    }
    for (const hint of SHOT_HINTS) {
      if (hint.pattern.test(query) && shot.shotType === hint.shotType) score += hint.boost;
    }
    const reason =
      score >= 4 ? '与场景描述高度匹配' : score >= 2 ? '关键词匹配' : score > 0 ? '可参考镜头' : '';
    return { id: shot.id, name: shot.name, score, reason };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function parseNlEdit(command: string, segIndex = 0): NlEditPatch[] | null {
  const cmd = command.trim();
  if (!cmd) return null;

  const durMatch = cmd.match(/(?:时长|时间).*?(\d+(?:\.\d+)?)\s*秒/);
  if (durMatch) {
    return [{ op: 'set', path: `segments[${segIndex}].duration_sec`, value: Number(durMatch[1]) }];
  }

  if (/开启字幕|打开字幕/.test(cmd)) {
    return [{ op: 'set', path: `segments[${segIndex}].subtitle.enabled`, value: true }];
  }
  if (/关闭字幕|隐藏字幕/.test(cmd)) {
    return [{ op: 'set', path: `segments[${segIndex}].subtitle.enabled`, value: false }];
  }

  if (/转场.*(?:淡|fade)/i.test(cmd)) {
    return [{ op: 'set', path: `segments[${segIndex}].transition.type`, value: 'fade' }];
  }
  if (/转场.*(?:无|关闭)/.test(cmd)) {
    return [{ op: 'set', path: `segments[${segIndex}].transition.type`, value: 'none' }];
  }

  if (/(?:数字人|口播).*(?:开|启|显示)/.test(cmd)) {
    return [{ op: 'set', path: `segments[${segIndex}].digital_human.enabled`, value: true }];
  }
  if (/(?:数字人|口播).*(?:关|隐藏)/.test(cmd)) {
    return [{ op: 'set', path: `segments[${segIndex}].digital_human.enabled`, value: false }];
  }

  return null;
}

export function applyNlPatches<T>(dsl: T, patches: NlEditPatch[]): T {
  const draft = structuredClone(dsl) as {
    segments: Array<Record<string, unknown>>;
  };
  for (const patch of patches) {
    const match = patch.path.match(/^segments\[(\d+)\]\.(.+)$/);
    if (!match) continue;
    const idx = Number(match[1]);
    const keyPath = match[2].split('.');
    const seg = draft.segments[idx];
    if (!seg) continue;
    let cursor: Record<string, unknown> = seg;
    for (let i = 0; i < keyPath.length - 1; i += 1) {
      const k = keyPath[i];
      if (typeof cursor[k] !== 'object' || cursor[k] === null) cursor[k] = {};
      cursor = cursor[k] as Record<string, unknown>;
    }
    cursor[keyPath[keyPath.length - 1]] = patch.value;
  }
  return draft as T;
}

export function buildSceneVideoPrompt(
  sceneDescription: string,
  options: { templateType?: string; cameraShot?: string; brandTone?: string } = {},
): string {
  const { templateType = '电商带货', cameraShot = '中景稳定镜头', brandTone = '专业可信' } = options;
  const subject = sceneDescription.trim() || '导购员介绍产品核心卖点';
  return [
    '【镜头】' + cameraShot,
    '【主体】' + subject,
    '【场景】竖屏 9:16 商业导购短视频，门店/电商场景',
    '【运镜】缓慢推进或轻微横移，节奏克制不花哨',
    '【光影】自然主光 + 柔和补光，肤色真实',
    '【风格】高清写实，品牌广告质感，' + brandTone,
    templateType ? `【类型】${templateType}` : '',
    '【约束】无字幕、无水印、无夸张滤镜',
  ].filter(Boolean).join('\n');
}

export function suggestFrameFromDesign(designMd: string): string {
  const hasProduct = /产品|product|卖点/i.test(designMd);
  const colorMatch = designMd.match(/#[0-9a-fA-F]{3,8}/);
  const accent = colorMatch?.[0] || '#2563eb';

  const lines = [
    '# frame.md — 自动生成建议（可粘贴后微调）',
    '',
    '## hf_shots',
    '',
    '| id | name | shot_type | duration | description |',
    '| avatar_intro | 数字人开场 | avatar_talking | 5 | 品牌开场口播，建立信任 |',
  ];
  if (hasProduct) {
    lines.push('| product_hero | 产品特写 | product_showcase | 6 | 突出产品卖点与细节 |');
  }
  lines.push(
    '| closing_cta | 结尾引导 | closing | 4 | 行动号召与品牌收口 |',
    '',
    '## subtitle_presets',
    '',
    `- default: 主色字幕，accent ${accent}`,
    '- bold-yellow: 强调卖点时使用',
    '',
    '## transitions',
    '',
    '- default: fade 0.5s',
  );
  return lines.join('\n');
}