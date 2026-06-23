export type AssetHubTab =
  | 'digital_human'
  | 'template'
  | 'brand'
  | 'look_preset'
  | 'voice'
  | 'script'
  | 'knowledge'
  | 'media';

export interface LibraryItem {
  id: string;
  category: string;
  name: string;
  description: string;
  status: string;
  tags: string[];
  file_url: string;
  parent_id?: string;
  payload: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  link?: string;
}

export interface LibrarySummary {
  counts: Record<string, number>;
  categories: string[];
}

export type AssetGroup = 'brand_role' | 'product_scene' | 'script_audio' | 'template_motion';

export interface AssetGroupDef {
  id: AssetGroup;
  label: string;
  hint: string;
  tabs: AssetHubTab[];
  defaultTab: AssetHubTab;
}

export const ASSET_GROUPS: AssetGroupDef[] = [
  { id: 'brand_role', label: '品牌与角色', hint: '品牌包、Logo、字体、数字人、声音', tabs: ['brand', 'digital_human', 'voice'], defaultTab: 'brand' },
  { id: 'product_scene', label: '商品与场景', hint: '商品图、场景图、视频、B-roll、参考图', tabs: ['media'], defaultTab: 'media' },
  { id: 'script_audio', label: '文案与音频', hint: '脚本、知识、口播、BGM、音效', tabs: ['script', 'knowledge'], defaultTab: 'script' },
  { id: 'template_motion', label: '模板与动效', hint: '视频模板、镜头模板、字幕样式、转场、Lottie 贴纸、外观预设', tabs: ['template', 'look_preset'], defaultTab: 'template' },
];

export function tabToGroup(tab: AssetHubTab): AssetGroup {
  const g = ASSET_GROUPS.find((grp) => grp.tabs.includes(tab));
  if (g) return g.id;
  return 'product_scene';
}

export function groupDef(groupId: AssetGroup): AssetGroupDef {
  return ASSET_GROUPS.find((g) => g.id === groupId) || ASSET_GROUPS[0];
}