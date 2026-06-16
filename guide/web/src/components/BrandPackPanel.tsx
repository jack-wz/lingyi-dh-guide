import { useMemo, useState } from 'react';
import { libraryPayloadToBrandPack } from '@shared/brandPack';
import { fontFamilyCss, useBrandFontFaces } from '../utils/brandFonts';
import type { LibraryItem } from '../types/library';

type SubTab = 'overview' | 'logo' | 'fonts' | 'shots' | 'presets' | 'source';

interface Props {
  item: LibraryItem;
}

export default function BrandPackPanel({ item }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const pack = useMemo(() => libraryPayloadToBrandPack(item), [item]);
  useBrandFontFaces(pack.fonts.map((f) => ({ family: f.family, url: f.url })));

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'overview', label: '概览' },
    { id: 'logo', label: `Logo${pack.subBrands.length ? ` (${pack.subBrands.length})` : ''}` },
    { id: 'fonts', label: `字体 (${pack.fontCount})` },
    { id: 'shots', label: `镜头 (${pack.frameCount})` },
    { id: 'presets', label: `预设 (${pack.presetCount})` },
    { id: 'source', label: '源文件' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`px-2.5 py-1 rounded-md text-[11px] border transition-opacity duration-150 ${
              subTab === t.id ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:opacity-90'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: '主色', color: pack.brandColor },
              { label: '背景', color: pack.backgroundColor },
              { label: '强调', color: pack.accentColor },
              { label: '文字', color: pack.textColor },
            ].map((c) => (
              <div key={c.label} className="text-center">
                <div className="h-16 rounded-md border border-border transition-transform duration-200 hover:scale-[1.02]" style={{ background: c.color }} title={c.color} />
                <div className="text-[9px] text-muted-foreground mt-1">{c.label}</div>
                <div className="text-[8px] font-mono text-muted-foreground">{c.color}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border p-3 bg-secondary/30">
            <div className="text-[10px] text-muted-foreground mb-1">默认字体</div>
            <div className="text-lg" style={{ fontFamily: pack.defaultFontFamily }}>永字八米 — {pack.defaultFontFamily}</div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {pack.fontCount} 字体 · {pack.frameCount} 镜头 · {pack.presetCount} 预设
          </p>
        </div>
      )}

      {subTab === 'logo' && (
        <div className="space-y-3 max-h-[320px] overflow-y-auto text-xs">
          <div className="rounded-md border border-border px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">主品牌 Logo</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${pack.useLogo ? 'bg-green-500/15 text-green-700' : 'bg-secondary text-muted-foreground'}`}>
                {pack.useLogo ? '已启用' : '已关闭'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 min-h-[56px]">
              {pack.logoUrl ? (
                <img src={pack.logoUrl} alt="" className="h-10 max-w-[100px] object-contain" />
              ) : (
                <span className="text-sm font-semibold px-2 py-1 rounded bg-brand-blue/15 text-brand-blue">{pack.logoLabel}</span>
              )}
              <span className="text-[10px] text-muted-foreground">{pack.logoUrl ? '图片 Logo' : '文字 Logo'}</span>
            </div>
          </div>
          {pack.subBrands.length > 0 ? (
            <div className="rounded-md border border-border px-3 py-2 space-y-2">
              <div className="font-medium">子品牌</div>
              {pack.subBrands.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 first:border-0 first:pt-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{sub.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {sub.enabled ? '启用' : '关闭'}
                      {pack.activeSubBrandId === sub.id ? ' · 默认调用' : ''}
                    </div>
                  </div>
                  {sub.logoUrl ? (
                    <img src={sub.logoUrl} alt="" className="h-8 max-w-[72px] object-contain shrink-0" />
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary shrink-0">{(sub.logoLabel || sub.name).slice(0, 4)}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">在品牌包编辑器「基本信息」中可添加子品牌并关联 Logo 元素。</p>
          )}
        </div>
      )}

      {subTab === 'fonts' && (
        <div className="space-y-2 max-h-[280px] overflow-y-auto">
          {pack.fonts.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无字体，请从本地模板重置或编辑 design.md</p>
          ) : pack.fonts.map((f) => (
            <div key={f.family} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium">{f.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">{f.family}</div>
                {f.url ? <div className="text-[9px] text-brand-blue mt-0.5">本地字体包</div> : null}
              </div>
              <div className="flex items-end gap-2 shrink-0 text-foreground" style={{ fontFamily: fontFamilyCss(f.family) }}>
                <span className="text-[18px] leading-none">永</span>
                <span className="text-[24px] leading-none">永</span>
                <span className="text-[32px] leading-none">永</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'shots' && (
        <div className="space-y-2 max-h-[280px] overflow-y-auto">
          {pack.frames.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无镜头模板，请从本地模板重置或编辑 frame.md</p>
          ) : pack.frames.map((f) => (
            <div key={f.id} className="rounded-md border border-border px-3 py-2">
              <div className="text-xs font-medium">{f.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{f.shotType} · {f.duration}s</div>
              {f.description && <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{f.description}</div>}
            </div>
          ))}
        </div>
      )}

      {subTab === 'presets' && (
        <div className="space-y-3 max-h-[320px] overflow-y-auto text-xs">
          {(() => {
            const presets = (item.payload?.presets || {}) as Record<string, unknown[]>;
            const rows = [
              ['色板', presets.colorPalette],
              ['文本样式', presets.textStyles],
              ['字幕样式', presets.subtitleStyles],
              ['动画', presets.animationPresets],
              ['版式', presets.layoutPresets],
              ['形状', presets.shapePresets],
              ['元素库', presets.elementLibrary],
            ] as const;
            return rows.map(([label, list]) => (
              <div key={label} className="rounded-md border border-border px-3 py-2">
                <div className="font-medium">{label} ({list?.length || 0})</div>
                {Array.isArray(list) && list.slice(0, 3).map((entry) => {
                  const e = entry as Record<string, unknown>;
                  return (
                    <div key={String(e.id)} className="text-[10px] text-muted-foreground mt-1">
                      {String(e.name || e.id)}
                      {label === '色板' && e.value ? (
                        <span className="inline-block w-3 h-3 rounded-sm ml-1 align-middle border border-border" style={{ background: String(e.value) }} />
                      ) : null}
                      {label === '文本样式' || label === '字幕样式' ? (
                        <span className="ml-2 inline-block px-1 rounded" style={{
                          color: String(e.color || '#fff'),
                          backgroundColor: String(e.backgroundColor || 'transparent'),
                          fontSize: '10px',
                        }}>样例</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>
      )}

      {subTab === 'source' && (
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          <button
            type="button"
            className="w-full text-[10px] text-brand-blue border border-dashed border-brand-blue/40 rounded-md py-2 hover:bg-brand-blue/5"
            onClick={async () => {
              const designMd = String(item.payload?.design_markdown || '');
              if (!designMd.trim()) return;
              const res = await fetch('/api/ai/suggest-frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ design_md: designMd }),
              });
              const data = await res.json();
              if (data.frame_md) window.prompt('frame.md 建议（可复制）', data.frame_md);
            }}
          >
            从 design.md 生成 frame 建议
          </button>
          <details className="rounded-md border border-border">
            <summary className="px-3 py-2 text-xs font-medium cursor-pointer">design.md</summary>
            <pre className="px-3 pb-3 text-[9px] text-muted-foreground whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
              {String(item.payload?.design_markdown || '（未导入）').slice(0, 4000)}
            </pre>
          </details>
          <details className="rounded-md border border-border">
            <summary className="px-3 py-2 text-xs font-medium cursor-pointer">frame.md</summary>
            <pre className="px-3 pb-3 text-[9px] text-muted-foreground whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
              {String(item.payload?.frame_markdown || '（未导入）').slice(0, 4000)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}