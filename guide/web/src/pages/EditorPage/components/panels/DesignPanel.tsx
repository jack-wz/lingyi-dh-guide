import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DSL, Segment } from '@shared/types/editor';
import type { LibraryItem } from '../../../../types/library';
import FileUploader from '../../../../components/FileUploader';
import FontFamilyPicker from '../../../../components/brand-editor/FontFamilyPicker';
import { IconFilm, IconMusic, IconPalette, IconSettings2, IconType } from '../../../../components/Icons';
import { SubtitleStyleHint, SubtitleStyleSelect } from '../../../../components/SubtitleStylePicker';
import {
  SUBTITLE_FONT_SIZE_DEFAULT,
  SUBTITLE_FONT_SIZE_MAX,
  SUBTITLE_FONT_SIZE_MIN,
} from '@shared/subtitleStyles';
import { libraryPayloadToBrandPack } from '@shared/brandPack';
import { useFontCatalog } from '../../../../utils/brandFonts';
import NumberField from '../common/NumberField';
import PanelSection from '../common/PanelSection';
import { getCanvasSizeForAspectRatio } from '../../utils/canvasSize';
import BgmQuickPicker from './BgmQuickPicker';

export default function DesignPanel({
  dsl,
  editorId,
  currentSegIndex,
  updateDsl,
  onInsertFrameShot,
  onPickBgm,
  onApplyBgm,
}: {
  dsl: DSL;
  editorId: string;
  currentSegIndex: number;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
  onInsertFrameShot: (frameId: string) => void;
  onPickBgm: () => void;
  onApplyBgm: (item: LibraryItem) => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const cfg = dsl.globalConfig;
  const [framePickerOpen, setFramePickerOpen] = useState(false);

  const activeBrandPack = cfg.brand_pack
    ? { id: cfg.brand_pack_id || 'inline', name: '已应用品牌包', payload: cfg.brand_pack } as LibraryItem
    : null;
  const activePackView = activeBrandPack ? libraryPayloadToBrandPack(activeBrandPack) : null;
  const { catalog: fontCatalog } = useFontCatalog();
  const packFonts = (cfg.brand_pack as { tokens?: { typography?: { fonts?: Array<{ name: string; family: string; url?: string }> } } } | undefined)
    ?.tokens?.typography?.fonts || [];
  const updateGlobal = (partial: Partial<DSL['globalConfig']>) => {
    updateDsl((draft) => ({ ...draft, globalConfig: { ...draft.globalConfig, ...partial } }));
  };
  const updateSeg = (partial: Partial<Segment>) => {
    updateDsl((draft) => {
      const segments = [...draft.segments];
      segments[currentSegIndex] = { ...segments[currentSegIndex], ...partial };
      return { ...draft, segments };
    });
  };

  return (
    <div className="p-4 space-y-4">
      <p className="text-[11px] text-muted-foreground -mt-1">
        全局样式与输出规格；当前分镜布局与背景图请在「图层」面板调整。
      </p>
      <PanelSection title="背景" icon={<IconPalette size={15} />}>
        <label className="block text-xs text-muted-foreground mb-1">背景色</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={cfg.background_color || '#f6f6f6'}
            onChange={(e) => updateGlobal({ background_color: e.target.value })}
            className="w-10 h-9 rounded border border-border bg-background"
          />
          <input
            value={(cfg.background_color || '#f6f6f6').toUpperCase()}
            onChange={(e) => updateGlobal({ background_color: e.target.value })}
            className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </div>
        <label className="mt-3 flex items-center justify-between text-sm">
          背景媒体
          <input
            type="checkbox"
            checked={Boolean(seg.scene_image_url || seg.scene_description)}
            onChange={(e) => {
              if (!e.target.checked) updateSeg({ scene_image_url: '', scene_description: '' });
            }}
          />
        </label>
      </PanelSection>

      <PanelSection title="音乐" icon={<IconMusic size={15} />}>
        <label className="flex items-center justify-between text-sm">
          启用音乐
          <input
            type="checkbox"
            checked={cfg.bgm_enabled ?? Boolean(cfg.bgm_url)}
            onChange={(e) => updateGlobal({ bgm_enabled: e.target.checked })}
          />
        </label>
        <div className="mt-3 flex gap-1.5">
          <button type="button" onClick={onPickBgm} className="flex-1 h-8 rounded-md border border-border bg-background hover:bg-accent text-[11px] text-brand-blue">
            从资产库选 BGM
          </button>
          <Link
            to={`/assets?tab=voice&from=${encodeURIComponent(`/editor/${editorId}`)}`}
            className="h-8 px-2 rounded-md border border-border text-[10px] text-muted-foreground hover:bg-accent flex items-center"
          >
            管理
          </Link>
        </div>
        <BgmQuickPicker onApply={onApplyBgm} />
        <FileUploader
          value={cfg.bgm_url || ''}
          onChange={(url) => updateGlobal({ bgm_url: url, bgm_enabled: Boolean(url) })}
          accept="audio/*"
          placeholder="或粘贴音乐 URL"
          previewType="audio"
          className="mt-2"
        />
        <label className="mt-3 block text-xs text-muted-foreground">音量 {Math.round((cfg.bgm_volume ?? 0.3) * 100)}%</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={cfg.bgm_volume ?? 0.3}
          onChange={(e) => updateGlobal({ bgm_volume: Number(e.target.value) })}
          className="w-full"
        />
        <label className="mt-3 flex items-center justify-between text-sm">
          循环播放
          <input
            type="checkbox"
            checked={cfg.bgm_loop ?? true}
            onChange={(e) => updateGlobal({ bgm_loop: e.target.checked })}
          />
        </label>
      </PanelSection>

      <PanelSection title="场景转场" icon={<IconSettings2 size={15} />}>
        <label className="flex items-center justify-between text-sm">
          启用转场
          <input
            type="checkbox"
            checked={(cfg.transition_enabled ?? false) || seg.transition.type !== 'none'}
            onChange={(e) => {
              updateGlobal({ transition_enabled: e.target.checked });
              updateSeg({ transition: { ...seg.transition, type: e.target.checked ? 'fade' : 'none' } });
            }}
          />
        </label>
        <select
          value={seg.transition.type}
          onChange={(e) => updateSeg({ transition: { ...seg.transition, type: e.target.value } })}
          className="mt-3 w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="none">无</option>
          <option value="fade">淡入淡出</option>
          <option value="slideup">上滑</option>
          <option value="zoomin">缩放进入</option>
        </select>
      </PanelSection>

      <PanelSection title="品牌与字幕" icon={<IconType size={15} />}>
        <div className="mb-4 space-y-2">
          {activePackView && (
            <p className="text-[10px] text-muted-foreground">
              顶栏已选品牌包 · {activePackView.fontCount} 字体 · {activePackView.frameCount} 镜头
            </p>
          )}
          {activePackView && activePackView.frameCount > 0 && (
            <div>
              <button type="button" onClick={() => setFramePickerOpen((v) => !v)} className="text-[10px] text-brand-blue hover:underline">
                从品牌包添加镜头
              </button>
              {framePickerOpen && (
                <div className="mt-2 max-h-36 overflow-y-auto space-y-1 border border-border rounded-md p-2">
                  {activePackView.frames.map((f) => (
                    <button key={f.id} type="button" onClick={() => { onInsertFrameShot(f.id); setFramePickerOpen(false); }}
                      className="w-full text-left text-[10px] px-2 py-1.5 rounded hover:bg-accent">
                      {f.name} <span className="text-muted-foreground">({f.duration}s)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <label className="block text-xs text-muted-foreground mb-1">品牌色</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={cfg.brand_color || '#4f46e5'}
            onChange={(e) => updateGlobal({ brand_color: e.target.value })}
            className="w-10 h-9 rounded border border-border bg-background"
          />
          <input
            value={cfg.brand_color || '#4f46e5'}
            onChange={(e) => updateGlobal({ brand_color: e.target.value })}
            className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </div>
        <label className="mt-3 block text-xs text-muted-foreground mb-1">Logo 链接</label>
        <FileUploader
          value={cfg.brand_logo_url || ''}
          onChange={(url) => updateGlobal({ brand_logo_url: url })}
          accept="image/*"
          placeholder="品牌 Logo 素材 URL"
          previewType="image"
        />
        <label className="mt-3 block text-xs text-muted-foreground mb-1">字幕样式</label>
        <SubtitleStyleSelect
          value={seg.subtitle.style_id}
          onChange={(styleId) => updateSeg({ subtitle: { ...seg.subtitle, style_id: styleId } })}
        />
        <SubtitleStyleHint styleId={seg.subtitle.style_id} />
        <FontFamilyPicker
          label="字幕默认字体"
          value={cfg.subtitle_font_family || cfg.default_font_family || ''}
          onChange={(v) => updateGlobal({ subtitle_font_family: v })}
          catalog={fontCatalog}
          packFonts={packFonts}
          previewText="字幕字体预览"
        />
        <NumberField
          label="字幕默认字号"
          value={cfg.subtitle_font_size ?? SUBTITLE_FONT_SIZE_DEFAULT}
          min={SUBTITLE_FONT_SIZE_MIN}
          max={SUBTITLE_FONT_SIZE_MAX}
          onChange={(value) => updateGlobal({ subtitle_font_size: value })}
        />
        <p className="text-[11px] text-muted-foreground">作用于全模板；单分镜可在右侧「字幕」面板单独覆盖字体与字号。</p>
      </PanelSection>

      <PanelSection title="输出规格" icon={<IconFilm size={15} />}>
        <label className="block text-xs text-muted-foreground mb-1">画布比例</label>
        <select
          value={cfg.aspect_ratio || '9:16'}
          onChange={(e) => {
            const aspectRatio = e.target.value as NonNullable<DSL['globalConfig']['aspect_ratio']>;
            updateGlobal({ aspect_ratio: aspectRatio, ...getCanvasSizeForAspectRatio(aspectRatio) });
          }}
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="9:16">9:16 竖屏</option>
          <option value="16:9">16:9 横屏</option>
          <option value="1:1">1:1 方形</option>
        </select>
        <label className="mt-3 block text-xs text-muted-foreground mb-1">输出清晰度</label>
        <select
          value={cfg.output_resolution || '1080p'}
          onChange={(e) => updateGlobal({ output_resolution: e.target.value })}
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
          <option value="2K">2K</option>
        </select>
      </PanelSection>
    </div>
  );
}
