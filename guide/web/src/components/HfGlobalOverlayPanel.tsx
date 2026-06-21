import type { HfGlobalOverlayItem, HfGlobalOverlayType } from '@shared/hfGlobalOverlayRenderer';
import { DEFAULT_HF_GLOBAL_OVERLAYS } from '@shared/hfGlobalOverlayRenderer';

const OVERLAY_META: Record<HfGlobalOverlayType, { label: string; hint: string }> = {
  'hf-grain': { label: '胶片颗粒', hint: '全片叠加动态噪点，增强质感' },
  'hf-vignette': { label: '暗角', hint: '边缘压暗，突出画面中心' },
  'hf-light-leak': { label: '漏光', hint: '暖色光斑扫过画面，电影感氛围' },
  'hf-motion-blur': { label: '动态模糊', hint: '周期性方向模糊脉冲，适合快节奏片段' },
  'hf-color-grade': { label: '调色', hint: '全片色温与饱和度微调，营造影院质感' },
};

export function HfGlobalOverlayPanel({
  overlays,
  onChange,
  brandColor,
}: {
  overlays: HfGlobalOverlayItem[] | undefined;
  onChange: (next: HfGlobalOverlayItem[]) => void;
  brandColor?: string;
}) {
  const normalized = DEFAULT_HF_GLOBAL_OVERLAYS.map((defaults) => {
    const found = (overlays || []).find((item) => item.type === defaults.type);
    return { ...defaults, ...found, enabled: Boolean(found?.enabled) };
  });

  const updateItem = (type: HfGlobalOverlayType, partial: Partial<HfGlobalOverlayItem>) => {
    const next = normalized.map((item) => (
      item.type === type ? { ...item, ...partial } : item
    ));
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {normalized.map((item) => {
        const meta = OVERLAY_META[item.type];
        return (
          <div key={item.type} className="rounded-md border border-border/80 p-3">
            <label className="flex items-center justify-between text-sm">
              <span>{meta.label}</span>
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => updateItem(item.type, { enabled: e.target.checked })}
              />
            </label>
            <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">{meta.hint}</p>
            {item.enabled && item.type === 'hf-grain' && (
              <div className="mt-2">
                <label className="block text-[10px] text-muted-foreground mb-1">
                  颗粒强度 {Math.round((item.opacity ?? 0.15) * 100)}%
                </label>
                <input
                  type="range"
                  min={0.05}
                  max={0.35}
                  step={0.01}
                  value={item.opacity ?? 0.15}
                  onChange={(e) => updateItem(item.type, { opacity: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            )}
            {item.enabled && item.type === 'hf-vignette' && (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    暗角强度 {Math.round((item.intensity ?? 0.7) * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0.3}
                    max={0.9}
                    step={0.05}
                    value={item.intensity ?? 0.7}
                    onChange={(e) => updateItem(item.type, { intensity: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    中心留白 {item.vignette_size ?? 45}%
                  </label>
                  <input
                    type="range"
                    min={35}
                    max={55}
                    step={1}
                    value={item.vignette_size ?? 45}
                    onChange={(e) => updateItem(item.type, { vignette_size: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            )}
            {item.enabled && item.type === 'hf-light-leak' && (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    漏光强度 {Math.round((item.leak_intensity ?? 0.45) * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0.2}
                    max={0.8}
                    step={0.05}
                    value={item.leak_intensity ?? 0.45}
                    onChange={(e) => updateItem(item.type, { leak_intensity: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={item.leak_color || brandColor || '#fb8b24'}
                    onChange={(e) => updateItem(item.type, { leak_color: e.target.value })}
                    className="w-9 h-8 rounded border border-border bg-background"
                  />
                  <span className="text-[10px] text-muted-foreground">漏光色（默认品牌色）</span>
                </div>
              </div>
            )}
            {item.enabled && item.type === 'hf-motion-blur' && (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    模糊强度 {Math.round((item.blur_intensity ?? 0.35) * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0.15}
                    max={0.65}
                    step={0.05}
                    value={item.blur_intensity ?? 0.35}
                    onChange={(e) => updateItem(item.type, { blur_intensity: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">模糊方向</label>
                  <select
                    value={item.direction || 'horizontal'}
                    onChange={(e) => updateItem(item.type, {
                      direction: e.target.value as 'horizontal' | 'vertical',
                    })}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="horizontal">水平</option>
                    <option value="vertical">垂直</option>
                  </select>
                </div>
              </div>
            )}
            {item.enabled && item.type === 'hf-color-grade' && (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    色温 {Math.round((item.grade_warmth ?? 0.58) * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={item.grade_warmth ?? 0.58}
                    onChange={(e) => updateItem(item.type, { grade_warmth: Number(e.target.value) })}
                    className="w-full"
                    data-testid="hf-color-grade-warmth"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    调色强度 {Math.round((item.grade_strength ?? 0.28) * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={0.5}
                    step={0.01}
                    value={item.grade_strength ?? 0.28}
                    onChange={(e) => updateItem(item.type, { grade_strength: Number(e.target.value) })}
                    className="w-full"
                    data-testid="hf-color-grade-strength"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    饱和度 {Math.round((item.grade_saturation ?? 1.08) * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0.85}
                    max={1.35}
                    step={0.01}
                    value={item.grade_saturation ?? 1.08}
                    onChange={(e) => updateItem(item.type, { grade_saturation: Number(e.target.value) })}
                    className="w-full"
                    data-testid="hf-color-grade-saturation"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-brand-blue/90 leading-relaxed">
        全局质感/VFX 叠加作用于整段视频；使用「模板编辑器」流水线时，成片合成后将自动叠加 HF 质感层。
      </p>
    </div>
  );
}