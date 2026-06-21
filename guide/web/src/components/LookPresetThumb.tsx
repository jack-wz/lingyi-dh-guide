import type { CSSProperties } from 'react';
import { getSubtitlePreviewStyle } from '@shared/subtitleStyles';
import type { HfGlobalOverlayItem } from '@shared/hfGlobalOverlayRenderer';
import { HF_TRANSITIONS } from './TransitionStylePicker';

function transitionSplitStyle(type: string): CSSProperties {
  const brand = '#1d4ed8';
  const accent = '#f59e0b';
  if (type.includes('wipe-left')) {
    return {
      background: `linear-gradient(90deg, ${brand} 48%, ${accent} 52%)`,
    };
  }
  if (type.includes('wipe-right')) {
    return {
      background: `linear-gradient(90deg, ${accent} 48%, ${brand} 52%)`,
    };
  }
  if (type.includes('push-left')) {
    return {
      background: `linear-gradient(90deg, ${brand} 55%, transparent 55%), linear-gradient(135deg, #0f172a 0%, #1e293b 100%)`,
    };
  }
  if (type.includes('push-right')) {
    return {
      background: `linear-gradient(90deg, transparent 45%, ${brand} 45%), linear-gradient(135deg, #0f172a 0%, #1e293b 100%)`,
    };
  }
  if (type.includes('push-up')) {
    return {
      background: `linear-gradient(180deg, transparent 50%, ${brand} 50%), linear-gradient(135deg, #0f172a 0%, #1e293b 100%)`,
    };
  }
  if (type.includes('push-down')) {
    return {
      background: `linear-gradient(180deg, ${brand} 50%, transparent 50%), linear-gradient(135deg, #0f172a 0%, #1e293b 100%)`,
    };
  }
  if (type.includes('zoom')) {
    return {
      background: `radial-gradient(circle at 50% 50%, ${accent} 0%, ${brand} 42%, #0f172a 72%)`,
    };
  }
  if (type.includes('circle-reveal')) {
    return {
      background: `radial-gradient(circle at 50% 50%, ${brand} 0%, ${brand} 28%, transparent 29%), linear-gradient(135deg, #0f172a 0%, #1e293b 100%)`,
    };
  }
  return {
    background: `linear-gradient(135deg, #0f172a 0%, #1e293b 55%, ${brand}33 100%)`,
  };
}

function overlayLayers(overlays: HfGlobalOverlayItem[] | undefined): CSSProperties {
  const layers: string[] = [];
  const enabled = (overlays || []).filter((item) => item?.enabled);
  for (const item of enabled) {
    if (item.type === 'hf-vignette') {
      const intensity = Math.min(1, Math.max(0, Number(item.intensity ?? 0.5)));
      layers.push(`radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${0.15 + intensity * 0.55}) 100%)`);
    }
    if (item.type === 'hf-light-leak') {
      const leak = Math.min(1, Math.max(0, Number(item.leak_intensity ?? 0.4)));
      layers.push(`linear-gradient(135deg, rgba(251,191,36,${leak * 0.45}) 0%, transparent 55%)`);
    }
    if (item.type === 'hf-motion-blur') {
      const blur = Math.min(1, Math.max(0, Number(item.blur_intensity ?? 0.3)));
      const horizontal = String(item.direction || 'horizontal') !== 'vertical';
      layers.push(
        horizontal
          ? `repeating-linear-gradient(90deg, transparent 0 3px, rgba(255,255,255,${blur * 0.12}) 3px 4px)`
          : `repeating-linear-gradient(180deg, transparent 0 3px, rgba(255,255,255,${blur * 0.12}) 3px 4px)`,
      );
    }
    if (item.type === 'hf-color-grade') {
      const warmth = Math.min(1, Math.max(0, Number(item.grade_warmth ?? 0.58)));
      const strength = Math.min(0.5, Math.max(0.1, Number(item.grade_strength ?? 0.28)));
      const warm = warmth >= 0.5
        ? `rgba(251,146,60,${strength * 0.45})`
        : `rgba(96,165,250,${strength * 0.4})`;
      layers.push(`linear-gradient(155deg, ${warm} 0%, transparent 62%)`);
    }
  }
  if (!layers.length) return {};
  return { backgroundImage: layers.join(', ') };
}

export default function LookPresetThumb({
  subtitleStyleId,
  transitionType,
  hfOverlays,
  testId = 'look-preset-thumb',
}: {
  subtitleStyleId?: string;
  transitionType?: string;
  hfOverlays?: HfGlobalOverlayItem[];
  testId?: string;
}) {
  const subtitleId = String(subtitleStyleId || 'hf-caption-highlight');
  const transitionId = String(transitionType || 'hf-dissolve');
  const preview = getSubtitlePreviewStyle(subtitleId);
  const transitionName = HF_TRANSITIONS.find((t) => t.id === transitionId)?.name?.replace(/（HF）/g, '') || '转场';
  const hasGrain = (hfOverlays || []).some((item) => item.type === 'hf-grain' && item.enabled);
  const grainOpacity = Number(
    (hfOverlays || []).find((item) => item.type === 'hf-grain' && item.enabled)?.opacity ?? 0.12,
  );

  return (
    <div
      data-testid={testId}
      className="w-full h-full relative overflow-hidden"
      style={transitionSplitStyle(transitionId)}
    >
      <div className="absolute inset-0" style={overlayLayers(hfOverlays)} />
      {hasGrain && (
        <div
          className="absolute inset-0 opacity-60 mix-blend-overlay pointer-events-none"
          style={{
            opacity: Math.min(0.5, grainOpacity * 2.5),
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
          }}
        />
      )}
      <span className="absolute top-1.5 right-1.5 inline-flex items-center rounded px-1 py-0.5 text-[7px] font-semibold bg-brand-blue/25 text-brand-blue backdrop-blur-sm">
        HF
      </span>
      <span className="absolute top-1.5 left-1.5 text-[7px] text-white/80 bg-black/35 rounded px-1 py-0.5 max-w-[55%] truncate">
        {transitionName}
      </span>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-2 px-2">
        <span
          style={{
            color: preview.color,
            background: preview.bg,
            fontSize: Math.max(8, preview.fontSize - 4),
            fontWeight: preview.fontWeight,
            borderRadius: preview.borderRadius,
            textShadow: preview.outline ? `0 1px 2px ${preview.outline}` : '0 1px 3px rgba(0,0,0,0.6)',
            padding: preview.bg && preview.bg !== 'transparent' ? '2px 8px' : '0',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          className="ring-1 ring-white/10"
        >
          {preview.text}
        </span>
      </div>
    </div>
  );
}