import type { Segment } from '../store/editorStore';

export function getSegmentIssues(seg: Segment) {
  const issues: string[] = [];
  if (!seg.narration_text.trim()) issues.push('缺少脚本');
  if (!seg.scene_image_url && !seg.scene_description.trim()) issues.push('缺少场景');
  if (seg.duration_sec <= 0) issues.push('时长异常');
  if (seg.digital_human.enabled && !seg.avatar_id) issues.push('未绑定数字人资产');
  if (seg.objects?.some(obj => obj.locked && obj.visible === false)) issues.push('存在隐藏且锁定对象');
  if (seg.diagnostics?.length) issues.push(...seg.diagnostics);
  return issues;
}