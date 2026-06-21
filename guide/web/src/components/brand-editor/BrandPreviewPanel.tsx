import type { BrandAssetDoc, BrandLogoSettings } from '@shared/brandTypes';
import { resolveActiveLogo } from '@shared/brandLogo';
import { fontFamilyCss, useBrandFontFaces } from '../../utils/brandFonts';
import type { VisualSection } from './types';

interface Props {
  doc: BrandAssetDoc;
  section: VisualSection;
  selectedIds: Record<string, string | null>;
  logoSettings?: BrandLogoSettings;
}

export default function BrandPreviewPanel({ doc, section, selectedIds, logoSettings }: Props) {
  const catalogFonts = Array.isArray((doc.design.typography as { fonts?: Array<{ family: string; url?: string }> }).fonts)
    ? (doc.design.typography as { fonts: Array<{ family: string; url?: string }> }).fonts
    : [];
  useBrandFontFaces(catalogFonts);
  const brandColor = doc.design.colors['digital-orange']
    || doc.design.colors['trust-blue']
    || doc.presets.colorPalette[0]?.value
    || '#ff5600';
  const bgColor = doc.design.colors['soft-pink'] || doc.design.colors['warm-white'] || '#fff5f0';
  const textColor = doc.design.colors['light-text'] || '#ffffff';

  const activeLogo = logoSettings ? resolveActiveLogo(logoSettings) : null;

  const selectedTextId = selectedIds.textStyles || doc.presets.textStyles[0]?.id;
  const textStyle = doc.presets.textStyles.find((t) => t.id === selectedTextId) || doc.presets.textStyles[0];

  const selectedSubId = selectedIds.subtitleStyles || doc.presets.subtitleStyles[0]?.id;
  const subStyle = doc.presets.subtitleStyles.find((s) => s.id === selectedSubId) || doc.presets.subtitleStyles[0];

  const selectedFrameId = selectedIds.frames || doc.frames[0]?.id;
  const frame = doc.frames.find((f) => f.id === selectedFrameId) || doc.frames[0];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="text-xs font-medium text-muted-foreground mb-2 px-1">实时预览</div>
      <div className="flex-1 flex items-center justify-center min-h-0 p-2">
        <div
          className="w-full max-w-[200px] aspect-[9/16] rounded-xl border-2 border-border shadow-lg overflow-hidden flex flex-col"
          style={{ background: bgColor }}
        >
          <div className="h-[28%] flex flex-col items-center justify-center px-3 gap-1" style={{ background: brandColor }}>
            {activeLogo?.enabled && activeLogo.url ? (
              <img src={activeLogo.url} alt="" className="max-h-[36px] max-w-[80px] object-contain" />
            ) : activeLogo?.enabled ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: textColor, background: 'rgba(0,0,0,0.12)' }}>
                {(activeLogo.label || doc.design.name).slice(0, 4)}
              </span>
            ) : (
              <span className="text-[10px] font-bold truncate" style={{ color: textColor }}>
                {doc.design.name || '品牌名'}
              </span>
            )}
            {section === 'basic' && logoSettings?.subBrands?.length ? (
              <span className="text-[7px] opacity-80" style={{ color: textColor }}>
                子品牌 {logoSettings.subBrands.filter((s) => s.enabled).length}
              </span>
            ) : null}
          </div>
          <div className="flex-1 p-3 flex flex-col justify-center gap-2">
            {section === 'fonts' && catalogFonts.length > 0 ? (
              <div className="text-center space-y-1">
                {catalogFonts.slice(0, 2).map((f) => (
                  <div
                    key={f.family}
                    style={{ fontFamily: fontFamilyCss(f.family), fontSize: 13, color: '#111' }}
                  >
                    永字八米
                  </div>
                ))}
              </div>
            ) : textStyle ? (
              <div style={{
                fontFamily: textStyle.fontFamily ? fontFamilyCss(textStyle.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '')) : undefined,
                fontSize: `${Math.min((textStyle.fontSize || 30) / 4, 14)}px`,
                fontWeight: textStyle.fontWeight,
                color: textStyle.color,
                backgroundColor: textStyle.backgroundColor,
                padding: textStyle.padding || '2px 6px',
                borderRadius: typeof textStyle.borderRadius === 'number' ? `${textStyle.borderRadius / 2}px` : textStyle.borderRadius,
                textAlign: (textStyle.textAlign as 'left' | 'center' | 'right') || 'center',
              }}>
                {textStyle.name}
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground text-center">文本样式</div>
            )}
            {frame && section === 'frames' && (
              <div className="text-[8px] text-center text-muted-foreground border border-dashed border-border rounded px-1 py-0.5">
                {frame.name} · {frame.shotType}
              </div>
            )}
            <div className="flex flex-wrap gap-1 justify-center mt-auto">
              {doc.presets.colorPalette.slice(0, 6).map((c) => (
                <div key={c.id} className="w-4 h-4 rounded-sm border border-border/50" style={{ background: c.value }} title={c.name} />
              ))}
            </div>
          </div>
          <div className="h-[18%] flex items-end justify-center pb-2 px-2">
            {subStyle ? (
              <span style={{
                fontFamily: subStyle.fontFamily ? fontFamilyCss(subStyle.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '')) : undefined,
                fontSize: `${Math.min((subStyle.fontSize || 28) / 3, 11)}px`,
                color: subStyle.color,
                backgroundColor: subStyle.backgroundColor || 'rgba(0,0,0,0.65)',
                padding: subStyle.padding || '2px 8px',
                borderRadius: subStyle.borderRadius ? `${subStyle.borderRadius / 2}px` : '4px',
              }}>
                字幕预览
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-2 px-1 space-y-1 text-[9px] text-muted-foreground border-t border-border pt-2">
        <div>当前分区：{sectionLabel(section)}</div>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(doc.design.colors).slice(0, 5).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-0.5">
              <span className="w-2 h-2 rounded-full border border-border" style={{ background: v }} />
              {k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function sectionLabel(section: VisualSection): string {
  const map: Record<VisualSection, string> = {
    basic: '基本信息', motionPresets: '外观动效', colors: '颜色', tokens: '圆角间距', fonts: '字体',
    frames: '镜头模板', palette: '色板', textStyles: '文本样式',
    subtitleStyles: '字幕样式', animations: '动画', layouts: '版式',
    shapes: '形状', elements: '元素库',
  };
  return map[section] || section;
}