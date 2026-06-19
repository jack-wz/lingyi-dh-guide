import {
  CLASSIC_SUBTITLE_STYLES,
  getAssSubtitleFallbackName,
  HF_SUBTITLE_STYLES,
  isHyperframesSubtitleStyle,
  normalizeSubtitleStyleId,
  type SubtitleStylePreview,
} from '@shared/subtitleStyles';

export type SubtitleStyleItem = {
  id: string;
  name: string;
  description: string;
  preview: SubtitleStylePreview;
  engine?: 'css' | 'hyperframes';
  hf_component?: string;
};

function PreviewChip({ preview, accent }: { preview: SubtitleStylePreview; accent?: boolean }) {
  return (
    <span
      style={{
        color: preview.color,
        background: preview.bg,
        fontSize: preview.fontSize,
        fontWeight: preview.fontWeight,
        borderRadius: preview.borderRadius,
        textShadow: preview.outline ? `0 1px 3px ${preview.outline}` : 'none',
        padding: preview.bg && preview.bg !== 'transparent' ? '4px 12px' : '0',
        whiteSpace: 'nowrap',
      }}
      className={accent ? 'ring-1 ring-brand-blue/40' : undefined}
    >
      {preview.text}
    </span>
  );
}

function HfBadge() {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold bg-brand-blue/15 text-brand-blue">
      HF
    </span>
  );
}

export function SubtitleStyleSelect({
  value,
  onChange,
  className = 'w-full h-9 rounded-md border border-border bg-background px-3 text-sm',
}: {
  value: string;
  onChange: (styleId: string) => void;
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <optgroup label="经典字幕">
        {CLASSIC_SUBTITLE_STYLES.map((style) => (
          <option key={style.id} value={style.id}>{style.name}</option>
        ))}
      </optgroup>
      {HF_SUBTITLE_STYLES.length > 0 && (
        <optgroup label="动效字幕（HyperFrames）">
          {HF_SUBTITLE_STYLES.map((style) => (
            <option key={style.id} value={style.id}>{style.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function SubtitleStyleHint({ styleId }: { styleId: string }) {
  if (!isHyperframesSubtitleStyle(styleId)) return null;
  const fallbackName = getAssSubtitleFallbackName(styleId);
  return (
    <p className="mt-2 text-[11px] text-brand-blue/90 leading-relaxed">
      动效字幕由 HyperFrames 渲染。编辑器预览可看到逐词高亮；标准 FFmpeg 流水线将降级为
      {fallbackName ? `「${fallbackName}」` : '近似'} ASS 样式，并在有 TTS 时输出词级卡拉 OK。
    </p>
  );
}

export function SubtitleStyleCards({
  activeStyleId,
  onSelect,
}: {
  activeStyleId: string;
  onSelect: (styleId: string) => void;
}) {
  const normalizedActive = normalizeSubtitleStyleId(activeStyleId);

  const renderCard = (style: SubtitleStyleItem, isHf: boolean) => {
    const isActive = normalizedActive === style.id;
    return (
      <div
        key={style.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(style.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(style.id);
          }
        }}
        className={`cursor-pointer rounded-lg overflow-hidden border transition-colors ${
          isActive ? 'border-foreground ring-1 ring-foreground/20' : 'border-border hover:border-foreground/30'
        }`}
      >
        <div className={`h-16 flex items-center justify-center px-3 relative ${
          isHf ? 'bg-gradient-to-br from-slate-800 via-slate-900 to-brand-blue/30' : 'bg-gradient-to-br from-gray-700 to-gray-900'
        }`}>
          <PreviewChip preview={style.preview} accent={isHf} />
          {isHf && (
            <span className="absolute top-2 right-2">
              <HfBadge />
            </span>
          )}
        </div>
        <div className="p-2">
          <p className="text-[11px] font-medium flex items-center gap-1.5">
            {style.name}
            {isHf ? <HfBadge /> : null}
          </p>
          <p className="text-[9px] text-muted-foreground">{style.description}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">经典字幕</p>
        <div className="space-y-2">
          {CLASSIC_SUBTITLE_STYLES.map((style) => renderCard(style, false))}
        </div>
      </div>
      {HF_SUBTITLE_STYLES.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            动效字幕
            <HfBadge />
          </p>
          <div className="space-y-2">
            {HF_SUBTITLE_STYLES.map((style) => renderCard(style, true))}
          </div>
        </div>
      )}
    </div>
  );
}