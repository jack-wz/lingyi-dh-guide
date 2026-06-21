import type { HfGlobalOverlayItem, HfGlobalOverlayType } from '@shared/hfGlobalOverlayRenderer';
import { DEFAULT_HF_GLOBAL_OVERLAYS } from '@shared/hfGlobalOverlayRenderer';

const OVERLAY_LABELS: Record<HfGlobalOverlayType, string> = {
  'hf-grain': '胶片颗粒',
  'hf-vignette': '暗角',
  'hf-light-leak': '漏光',
  'hf-motion-blur': '动态模糊',
  'hf-color-grade': '调色',
};

export function normalizeLookPresetOverlays(raw: unknown): HfGlobalOverlayItem[] {
  const incoming = Array.isArray(raw) ? raw as HfGlobalOverlayItem[] : [];
  return DEFAULT_HF_GLOBAL_OVERLAYS.map((defaults) => {
    const found = incoming.find((item) => item.type === defaults.type);
    return { ...defaults, ...found, enabled: Boolean(found?.enabled) };
  });
}

function OverlaySliders({
  item,
  onPatch,
}: {
  item: HfGlobalOverlayItem;
  onPatch: (partial: Partial<HfGlobalOverlayItem>) => void;
}) {
  if (!item.enabled) return null;

  if (item.type === 'hf-grain') {
    return (
      <label className="block text-[10px] text-muted-foreground mt-1.5">
        颗粒强度 {Math.round((item.opacity ?? 0.15) * 100)}%
        <input
          type="range"
          data-testid="look-preset-overlay-hf-grain-opacity"
          min={0.05}
          max={0.35}
          step={0.01}
          value={item.opacity ?? 0.15}
          onChange={(e) => onPatch({ opacity: Number(e.target.value) })}
          className="w-full mt-1"
        />
      </label>
    );
  }

  if (item.type === 'hf-vignette') {
    return (
      <div className="mt-1.5 space-y-1.5">
        <label className="block text-[10px] text-muted-foreground">
          暗角强度 {Math.round((item.intensity ?? 0.7) * 100)}%
          <input
            type="range"
            data-testid="look-preset-overlay-hf-vignette-intensity"
            min={0.3}
            max={0.9}
            step={0.05}
            value={item.intensity ?? 0.7}
            onChange={(e) => onPatch({ intensity: Number(e.target.value) })}
            className="w-full mt-1"
          />
        </label>
        <label className="block text-[10px] text-muted-foreground">
          中心留白 {item.vignette_size ?? 45}%
          <input
            type="range"
            data-testid="look-preset-overlay-hf-vignette-size"
            min={35}
            max={55}
            step={1}
            value={item.vignette_size ?? 45}
            onChange={(e) => onPatch({ vignette_size: Number(e.target.value) })}
            className="w-full mt-1"
          />
        </label>
      </div>
    );
  }

  if (item.type === 'hf-light-leak') {
    return (
      <label className="block text-[10px] text-muted-foreground mt-1.5">
        漏光强度 {Math.round((item.leak_intensity ?? 0.45) * 100)}%
        <input
          type="range"
          data-testid="look-preset-overlay-hf-light-leak-intensity"
          min={0.2}
          max={0.8}
          step={0.05}
          value={item.leak_intensity ?? 0.45}
          onChange={(e) => onPatch({ leak_intensity: Number(e.target.value) })}
          className="w-full mt-1"
        />
      </label>
    );
  }

  if (item.type === 'hf-color-grade') {
    return (
      <div className="mt-1.5 space-y-1.5">
        <label className="block text-[10px] text-muted-foreground">
          色温 {Math.round((item.grade_warmth ?? 0.58) * 100)}%
          <input
            type="range"
            data-testid="look-preset-overlay-hf-color-grade-warmth"
            min={0}
            max={1}
            step={0.01}
            value={item.grade_warmth ?? 0.58}
            onChange={(e) => onPatch({ grade_warmth: Number(e.target.value) })}
            className="w-full mt-1"
          />
        </label>
        <label className="block text-[10px] text-muted-foreground">
          调色强度 {Math.round((item.grade_strength ?? 0.28) * 100)}%
          <input
            type="range"
            data-testid="look-preset-overlay-hf-color-grade-strength"
            min={0.1}
            max={0.5}
            step={0.01}
            value={item.grade_strength ?? 0.28}
            onChange={(e) => onPatch({ grade_strength: Number(e.target.value) })}
            className="w-full mt-1"
          />
        </label>
        <label className="block text-[10px] text-muted-foreground">
          饱和度 {Math.round((item.grade_saturation ?? 1.08) * 100)}%
          <input
            type="range"
            data-testid="look-preset-overlay-hf-color-grade-saturation"
            min={0.85}
            max={1.35}
            step={0.01}
            value={item.grade_saturation ?? 1.08}
            onChange={(e) => onPatch({ grade_saturation: Number(e.target.value) })}
            className="w-full mt-1"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      <label className="block text-[10px] text-muted-foreground">
        模糊强度 {Math.round((item.blur_intensity ?? 0.35) * 100)}%
        <input
          type="range"
          data-testid="look-preset-overlay-hf-motion-blur-intensity"
          min={0.15}
          max={0.65}
          step={0.05}
          value={item.blur_intensity ?? 0.35}
          onChange={(e) => onPatch({ blur_intensity: Number(e.target.value) })}
          className="w-full mt-1"
        />
      </label>
      <label className="block text-[10px] text-muted-foreground">
        方向
        <select
          data-testid="look-preset-overlay-hf-motion-blur-direction"
          className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[11px]"
          value={item.direction || 'horizontal'}
          onChange={(e) => onPatch({ direction: e.target.value as 'horizontal' | 'vertical' })}
        >
          <option value="horizontal">水平</option>
          <option value="vertical">垂直</option>
        </select>
      </label>
    </div>
  );
}

export default function LookPresetOverlayFields({
  overlays,
  onChange,
}: {
  overlays: HfGlobalOverlayItem[];
  onChange: (next: HfGlobalOverlayItem[]) => void;
}) {
  const patchItem = (type: HfGlobalOverlayType, partial: Partial<HfGlobalOverlayItem>) => {
    onChange(overlays.map((item) => (item.type === type ? { ...item, ...partial } : item)));
  };

  const toggle = (type: HfGlobalOverlayType, enabled: boolean) => {
    patchItem(type, { enabled });
  };

  return (
    <div className="space-y-2" data-testid="look-preset-overlays">
      <p className="text-xs text-muted-foreground">全局质感（可多选，可调强度）</p>
      <div className="space-y-2">
        {overlays.map((item) => (
          <div
            key={item.type}
            className="rounded-md border border-border px-2.5 py-2"
          >
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                data-testid={`look-preset-overlay-${item.type}`}
                checked={item.enabled}
                onChange={(e) => toggle(item.type, e.target.checked)}
              />
              <span>{OVERLAY_LABELS[item.type]}</span>
            </label>
            <OverlaySliders item={item} onPatch={(partial) => patchItem(item.type, partial)} />
          </div>
        ))}
      </div>
    </div>
  );
}