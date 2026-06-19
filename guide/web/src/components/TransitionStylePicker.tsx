import { isHyperframesTransitionType } from '@shared/hfTransitionRenderer';

export const CLASSIC_TRANSITIONS = [
  { id: 'none', name: '无' },
  { id: 'fade', name: '淡入淡出' },
  { id: 'slideup', name: '上滑' },
  { id: 'zoomin', name: '缩放进入' },
] as const;

export const HF_TRANSITIONS = [
  { id: 'hf-dissolve', name: '溶解过渡（HF）', description: '品牌色溶解叠化，适合柔和切换' },
  { id: 'hf-push', name: '推入过渡（HF）', description: '色块推入推出，节奏感强' },
  { id: 'hf-push-left', name: '左推过渡（HF）', description: '从左侧推入切场' },
  { id: 'hf-push-right', name: '右推过渡（HF）', description: '从右侧推入切场' },
  { id: 'hf-push-up', name: '上推过渡（HF）', description: '自下向上推入，适合竖屏节奏切场' },
  { id: 'hf-push-down', name: '下推过渡（HF）', description: '自上向下推入，适合段落收束' },
  { id: 'hf-zoom', name: '缩放过渡（HF）', description: '品牌色径向缩放，强调段落转折' },
  { id: 'hf-wipe-left', name: '左擦除（HF）', description: '品牌色从左向右擦除切场' },
  { id: 'hf-wipe-right', name: '右擦除（HF）', description: '品牌色从右向左擦除切场' },
] as const;

export function TransitionStyleSelect({
  value,
  onChange,
  className = 'w-full h-9 rounded-md border border-border bg-background px-3 text-sm',
}: {
  value: string;
  onChange: (type: string) => void;
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <optgroup label="经典转场">
        {CLASSIC_TRANSITIONS.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </optgroup>
      <optgroup label="动效转场（HyperFrames）">
        {HF_TRANSITIONS.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </optgroup>
    </select>
  );
}

export function TransitionStyleHint({ type }: { type: string }) {
  if (!isHyperframesTransitionType(type)) return null;
  const item = HF_TRANSITIONS.find((t) => t.id === type);
  return (
    <p className="mt-2 text-[11px] text-brand-blue/90 leading-relaxed">
      {item?.description || 'HyperFrames 动效转场'}。完整动效需使用「HyperFrames 模板」流水线；标准流水线将忽略 HF 转场。
    </p>
  );
}