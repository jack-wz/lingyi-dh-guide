import type { HfGlobalOverlayItem, HfGlobalOverlayType } from '@shared/hfGlobalOverlayRenderer';
import { DEFAULT_HF_GLOBAL_OVERLAYS } from '@shared/hfGlobalOverlayRenderer';

const OVERLAY_META: Record<HfGlobalOverlayType, { label: string; hint: string }> = {
  'hf-grain': { label: '胶片颗粒', hint: '全片叠加动态噪点，增强质感' },
  'hf-vignette': { label: '暗角', hint: '边缘压暗，突出画面中心' },
};

export function HfGlobalOverlayPanel({
  overlays,
  onChange,
}: {
  overlays: HfGlobalOverlayItem[] | undefined;
  onChange: (next: HfGlobalOverlayItem[]) => void;
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
          </div>
        );
      })}
      <p className="text-[10px] text-brand-blue/90 leading-relaxed">
        全局质感叠加作用于整段视频；完整效果需使用「HyperFrames 模板」流水线。
      </p>
    </div>
  );
}