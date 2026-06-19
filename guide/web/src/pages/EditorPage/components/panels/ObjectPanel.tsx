import type { CanvasElement, DSL, EditorObject, Segment } from '@shared/types/editor';
import FileUploader from '../../../../components/FileUploader';
import FontFamilyPicker from '../../../../components/brand-editor/FontFamilyPicker';
import { IconEye, IconEyeOff, IconImage, IconLayout, IconMic, IconType } from '../../../../components/Icons';
import { SUBTITLE_STYLES } from '../../../../data/subtitleStyles';
import { SubtitleStyleHint, SubtitleStyleSelect } from '../../../../components/SubtitleStylePicker';
import SegmentTtsPreview from '../../../../components/SegmentTtsPreview';
import { segmentUsesTtsWordTimings } from '@shared/captionWordTimings';
import { isHyperframesSubtitleStyle } from '@shared/subtitleStyles';
import {
  resolveSubtitleFontSize,
  SUBTITLE_FONT_SIZE_DEFAULT,
  SUBTITLE_FONT_SIZE_MAX,
  SUBTITLE_FONT_SIZE_MIN,
  resolveSubtitleFontFamily,
} from '@shared/subtitleStyles';
import { useFontCatalog } from '../../../../utils/brandFonts';
import { getObjectLabel } from '../../../../utils/editorObjects';
import { bakeOverlayDimensions } from '../../../../components/VideoCanvas/utils/objectBox';
import { resolveElementTiming } from '../../../../utils/elementTiming';
import { useEditorStore } from '../../../../store/editorStore';
import EmptyObjectState from '../common/EmptyObjectState';
import NumberField from '../common/NumberField';
import PanelSection from '../common/PanelSection';

export default function ObjectPanel({
  dsl,
  currentSegIndex,
  selectedElement,
  updateDsl,
}: {
  dsl: DSL;
  currentSegIndex: number;
  selectedElement: CanvasElement;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const { catalog: fontCatalog } = useFontCatalog();
  const packFonts = (dsl.globalConfig.brand_pack as { tokens?: { typography?: { fonts?: Array<{ name: string; family: string; url?: string }> } } } | undefined)
    ?.tokens?.typography?.fonts || [];
  const updateSeg = (partial: Partial<Segment>) => {
    updateDsl((draft) => {
      const segments = [...draft.segments];
      segments[currentSegIndex] = { ...segments[currentSegIndex], ...partial };
      return { ...draft, segments };
    });
  };

  if (selectedElement.type === 'digital_human') {
    const dh = seg.digital_human;
    return (
      <div className="p-4 space-y-4">
        <PanelSection title="数字人" icon={<IconMic size={15} />}>
          <label className="flex items-center justify-between text-sm">
            显示数字人
            <input type="checkbox" checked={dh.enabled} onChange={(e) => updateSeg({ digital_human: { ...dh, enabled: e.target.checked } })} />
          </label>
          <NumberField label="X 位置" value={dh.position.x} min={0} max={100} onChange={(value) => updateSeg({ digital_human: { ...dh, position: { ...dh.position, x: value } } })} />
          <NumberField label="Y 位置" value={dh.position.y} min={0} max={100} onChange={(value) => updateSeg({ digital_human: { ...dh, position: { ...dh.position, y: value } } })} />
          <NumberField label="缩放" value={dh.scale} min={20} max={220} onChange={(value) => updateSeg({ digital_human: { ...dh, scale: value } })} />
        </PanelSection>
      </div>
    );
  }

  if (selectedElement.type === 'subtitle') {
    const resolvedSize = resolveSubtitleFontSize({
      styleId: seg.subtitle.style_id,
      fontSize: seg.subtitle.font_size,
      globalFontSize: dsl.globalConfig.subtitle_font_size,
    });
    const resolvedFont = resolveSubtitleFontFamily({
      fontFamily: seg.subtitle.font_family,
      globalSubtitleFontFamily: dsl.globalConfig.subtitle_font_family,
      defaultFontFamily: dsl.globalConfig.default_font_family,
    });
    return (
      <div className="p-4 space-y-4">
        <PanelSection title="字幕" icon={<IconType size={15} />}>
          <label className="flex items-center justify-between text-sm">
            显示字幕
            <input type="checkbox" checked={seg.subtitle.enabled} onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, enabled: e.target.checked } })} />
          </label>
          <div className="mt-3">
            <SubtitleStyleSelect
              value={seg.subtitle.style_id}
              onChange={(styleId) => updateSeg({ subtitle: { ...seg.subtitle, style_id: styleId } })}
            />
          </div>
          <SubtitleStyleHint styleId={seg.subtitle.style_id} />
          {isHyperframesSubtitleStyle(seg.subtitle.style_id) && (
            <>
              <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
                {segmentUsesTtsWordTimings(seg)
                  ? '已绑定 TTS 词级时间轴，卡拉 OK 将与配音对齐。'
                  : '预览使用估算词级时间轴；可点击下方试听并对齐，或成片后自动 Whisper 对齐。'}
              </p>
              <SegmentTtsPreview
                text={seg.narration_text || ''}
                segment={seg}
                voiceId={seg.voice_id}
                onApply={(patch) => updateSeg(patch)}
              />
            </>
          )}
          {isHyperframesSubtitleStyle(seg.subtitle.style_id) && (
            <div className="mt-3">
              <label className="block text-xs text-muted-foreground mb-1">强调词（逗号分隔）</label>
              <input
                value={(seg.subtitle.hf_params?.emphasis_words || []).join('，')}
                onChange={(e) => {
                  const emphasis_words = e.target.value
                    .split(/[,，]/)
                    .map((w) => w.trim())
                    .filter(Boolean);
                  updateSeg({
                    subtitle: {
                      ...seg.subtitle,
                      hf_params: { ...seg.subtitle.hf_params, emphasis_words },
                    },
                  });
                }}
                placeholder="例如：限时特惠，新品"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
          )}
          <div className="mt-3">
            <FontFamilyPicker
              label="字幕字体"
              value={seg.subtitle.font_family || dsl.globalConfig.subtitle_font_family || dsl.globalConfig.default_font_family || ''}
              onChange={(v) => updateSeg({ subtitle: { ...seg.subtitle, font_family: v } })}
              catalog={fontCatalog}
              packFonts={packFonts}
              previewText="字幕字体"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">当前渲染字体：{resolvedFont}</p>
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => updateSeg({ subtitle: { ...seg.subtitle, font_family: undefined } })}
          >
            恢复为模板默认字体
          </button>
          <NumberField
            label="字号"
            value={seg.subtitle.font_size ?? dsl.globalConfig.subtitle_font_size ?? SUBTITLE_FONT_SIZE_DEFAULT}
            min={SUBTITLE_FONT_SIZE_MIN}
            max={SUBTITLE_FONT_SIZE_MAX}
            onChange={(value) => updateSeg({ subtitle: { ...seg.subtitle, font_size: value } })}
          />
          <p className="text-[11px] text-muted-foreground">
            当前渲染约 {resolvedSize}px（范围 {SUBTITLE_FONT_SIZE_MIN}–{SUBTITLE_FONT_SIZE_MAX}）
          </p>
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => updateSeg({ subtitle: { ...seg.subtitle, font_size: undefined } })}
          >
            恢复为模板默认字号
          </button>
          <select
            value={seg.subtitle.position}
            onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, position: e.target.value as Segment['subtitle']['position'] } })}
            className="mt-3 w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="top">顶部</option>
            <option value="center">中间</option>
            <option value="bottom">底部</option>
          </select>
        </PanelSection>
      </div>
    );
  }

  if (selectedElement.type === 'overlay') {
    const overlay = seg.overlays[selectedElement.overlayIndex];
    if (!overlay) return <EmptyObjectState />;
    const updateOverlay = (partial: Partial<typeof overlay>) => {
      const overlays = [...seg.overlays];
      overlays[selectedElement.overlayIndex] = { ...overlay, ...partial };
      updateSeg({ overlays });
    };
    const duplicateOverlay = () => {
      const copy = { ...overlay, id: `overlay-${Date.now()}`, position: { x: Math.min(100, overlay.position.x + 4), y: Math.min(100, overlay.position.y + 4) } };
      const overlays = [...seg.overlays];
      overlays.splice(selectedElement.overlayIndex + 1, 0, copy);
      updateSeg({ overlays });
      setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: selectedElement.overlayIndex + 1 });
    };
    const deleteOverlay = () => {
      const overlays = seg.overlays.filter((_, index) => index !== selectedElement.overlayIndex);
      updateSeg({ overlays });
      setSelectedElement({ type: 'none' });
    };
    return (
      <div className="p-4 space-y-4">
        <PanelSection title="叠加素材" icon={<IconImage size={15} />}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={duplicateOverlay} className="h-8 rounded-md bg-secondary text-secondary-foreground hover:bg-accent text-xs">复制</button>
            <button type="button" onClick={deleteOverlay} className="h-8 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs">删除</button>
          </div>
          <FileUploader
            value={overlay.asset_url}
            onChange={(url) => updateOverlay({ asset_url: url })}
            accept="image/*,video/*"
            placeholder="素材链接"
            previewType="image"
          />
          <label className="block text-xs text-muted-foreground mb-1">开始时间 (s)</label>
          <input
            type="number"
            min={0}
            max={seg.duration_sec}
            step={0.1}
            value={overlay.seg_start_time}
            onChange={(e) => updateOverlay({ seg_start_time: Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <label className="mt-3 block text-xs text-muted-foreground mb-1">持续时长 (s)</label>
          <input
            type="number"
            min={0.1}
            max={seg.duration_sec}
            step={0.1}
            value={overlay.duration}
            onChange={(e) => updateOverlay({ duration: Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <label className="mt-3 block text-xs text-muted-foreground mb-1">入场动画</label>
          <select
            value={overlay.animation}
            onChange={(e) => updateOverlay({ animation: e.target.value as typeof overlay.animation })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="none">无</option>
            <option value="fadeIn">淡入</option>
            <option value="scaleIn">缩放</option>
          </select>
          <NumberField label="X 位置" value={overlay.position.x} min={0} max={100} onChange={(value) => updateOverlay({ position: { ...overlay.position, x: value } })} />
          <NumberField label="Y 位置" value={overlay.position.y} min={0} max={100} onChange={(value) => updateOverlay({ position: { ...overlay.position, y: value } })} />
          <NumberField
            label="缩放"
            value={overlay.scale}
            min={10}
            max={250}
            onChange={(value) => updateOverlay(bakeOverlayDimensions(overlay, value))}
          />
          <NumberField label="旋转" value={overlay.rotation || 0} min={-180} max={180} onChange={(value) => updateOverlay({ rotation: value })} />
          <NumberField label="宽度 %" value={overlay.render_width_pct ?? 20} min={5} max={100} onChange={(value) => updateOverlay({ render_width_pct: value })} />
          <NumberField label="高度 %" value={overlay.render_height_pct ?? 12} min={5} max={100} onChange={(value) => updateOverlay({ render_height_pct: value })} />
        </PanelSection>
      </div>
    );
  }

  if (selectedElement.type === 'object') {
    const object = seg.objects?.[selectedElement.objectIndex];
    if (!object) return <EmptyObjectState />;
    const brandPackPayload = dsl.globalConfig.brand_pack as { tokens?: { typography?: { fonts?: Array<{ name: string; family: string }> } } } | undefined;
    const brandFonts = brandPackPayload?.tokens?.typography?.fonts || [];
    const defaultFont = dsl.globalConfig.default_font_family || 'sans-serif';
    const segDur = Number(seg.duration_sec || 5);
    const objectTiming = resolveElementTiming(object, segDur);
    const updateObject = (partial: Partial<EditorObject>) => {
      const objects = [...(seg.objects || [])];
      objects[selectedElement.objectIndex] = { ...object, ...partial };
      updateSeg({ objects });
    };
    const updateObjectStyle = (partial: NonNullable<EditorObject['style']>) => {
      updateObject({ style: { ...object.style, ...partial } });
    };
    const duplicateObject = () => {
      const objects = [...(seg.objects || [])];
      const copy: EditorObject = {
        ...object,
        id: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: `${object.label || getObjectLabel(object)} 副本`,
        position: { x: Math.min(100, object.position.x + 4), y: Math.min(100, object.position.y + 4) },
      };
      objects.splice(selectedElement.objectIndex + 1, 0, copy);
      updateSeg({ objects });
      setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: selectedElement.objectIndex + 1 });
    };
    const deleteObject = () => {
      const objects = (seg.objects || []).filter((_, index) => index !== selectedElement.objectIndex);
      updateSeg({ objects });
      setSelectedElement({ type: 'none' });
    };
    const moveObject = (direction: -1 | 1) => {
      const objects = [...(seg.objects || [])];
      const nextIndex = selectedElement.objectIndex + direction;
      if (nextIndex < 0 || nextIndex >= objects.length) return;
      const [moved] = objects.splice(selectedElement.objectIndex, 1);
      objects.splice(nextIndex, 0, moved);
      updateSeg({ objects });
      setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: nextIndex });
    };
    return (
      <div className="p-4 space-y-4">
        <PanelSection title={getObjectLabel(object)} icon={<IconLayout size={15} />}>
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            <button type="button" onClick={() => moveObject(-1)} className="h-8 rounded-md bg-secondary text-secondary-foreground hover:bg-accent text-xs">后移</button>
            <button type="button" onClick={() => moveObject(1)} className="h-8 rounded-md bg-secondary text-secondary-foreground hover:bg-accent text-xs">前移</button>
            <button type="button" onClick={duplicateObject} className="h-8 rounded-md bg-secondary text-secondary-foreground hover:bg-accent text-xs">复制</button>
            <button type="button" onClick={deleteObject} className="h-8 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs">删除</button>
          </div>
          <label className="block text-xs text-muted-foreground mb-1">名称</label>
          <input
            value={object.label || ''}
            onChange={(e) => updateObject({ label: e.target.value })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          {(object.type === 'text' || object.type === 'subtitle') && (
            <>
              <label className="mt-3 block text-xs text-muted-foreground mb-1">文字</label>
              <textarea
                value={object.text || ''}
                onChange={(e) => updateObject({ text: e.target.value })}
                className="w-full h-20 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <label className="mt-3 block text-xs text-muted-foreground mb-1">文字样式预设</label>
              <select
                value={object.style?.variant || 'custom'}
                onChange={(e) => {
                  const style = SUBTITLE_STYLES.find((item) => item.id === e.target.value);
                  if (!style) return;
                  updateObject({
                    style: {
                      ...object.style,
                      variant: style.id,
                      textColor: style.preview.color,
                      background: style.preview.bg === 'transparent' ? 'transparent' : style.preview.bg,
                      fill: style.preview.bg === 'transparent' ? undefined : style.preview.bg,
                      outline: style.preview.outline,
                      fontSize: style.preview.fontSize,
                      fontWeight: style.preview.fontWeight,
                      borderRadius: style.preview.borderRadius ?? 8,
                    },
                  });
                }}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="custom">自定义</option>
                {SUBTITLE_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>{style.name}</option>
                ))}
              </select>
              <NumberField label="字号" value={object.style?.fontSize ?? 16} min={10} max={48} onChange={(value) => updateObjectStyle({ fontSize: value })} />
              <NumberField label="字重" value={object.style?.fontWeight ?? 500} min={300} max={900} onChange={(value) => updateObjectStyle({ fontWeight: value })} />
              <label className="mt-3 block text-xs text-muted-foreground mb-1">字体</label>
              <select
                value={object.style?.fontFamily || defaultFont}
                onChange={(e) => updateObjectStyle({ fontFamily: e.target.value })}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                {brandFonts.length > 0 ? brandFonts.map((f) => (
                  <option key={f.family} value={f.family}>{f.name}</option>
                )) : (
                  <>
                    <option value={defaultFont}>品牌默认</option>
                    <option value="sans-serif">无衬线</option>
                    <option value="serif">衬线</option>
                  </>
                )}
              </select>
              <label className="mt-3 block text-xs text-muted-foreground mb-1">文字颜色</label>
              <div className="flex items-center gap-2">
                <input type="color" value={object.style?.textColor || '#111827'} onChange={(e) => updateObjectStyle({ textColor: e.target.value })} className="w-10 h-9 rounded border border-border bg-background" />
                <input value={object.style?.textColor || '#111827'} onChange={(e) => updateObjectStyle({ textColor: e.target.value })} className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm" />
              </div>
              <label className="mt-3 block text-xs text-muted-foreground mb-1">背景色</label>
              <div className="flex items-center gap-2">
                <input type="color" value={object.style?.background?.startsWith('#') ? object.style.background : '#ffffff'} onChange={(e) => updateObjectStyle({ background: e.target.value, fill: e.target.value })} className="w-10 h-9 rounded border border-border bg-background" />
                <button type="button" onClick={() => updateObjectStyle({ background: 'transparent', fill: undefined })} className="h-9 px-3 rounded-md bg-secondary text-xs">透明</button>
              </div>
            </>
          )}
          <label className="mt-3 block text-xs text-muted-foreground mb-1">开始时间 (s)</label>
          <input
            type="number"
            min={0}
            max={segDur}
            step={0.1}
            value={objectTiming.start}
            onChange={(e) => updateObject({ seg_start_time: Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <label className="mt-3 block text-xs text-muted-foreground mb-1">持续时长 (s)</label>
          <input
            type="number"
            min={0.1}
            max={segDur}
            step={0.1}
            value={objectTiming.duration}
            onChange={(e) => updateObject({ duration: Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <label className="mt-3 block text-xs text-muted-foreground mb-1">入场动画</label>
          <select
            value={object.animation || 'none'}
            onChange={(e) => updateObject({ animation: e.target.value as EditorObject['animation'] })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="none">无</option>
            <option value="fadeIn">淡入</option>
            <option value="scaleIn">缩放</option>
          </select>
          {object.type !== 'text' && (
            <>
              <label className="mt-3 block text-xs text-muted-foreground mb-1">素材 URL</label>
              <FileUploader
                value={object.asset_url || ''}
                onChange={(url) => updateObject({ asset_url: url })}
                accept="image/*,video/*"
                placeholder="素材链接"
                previewType="image"
              />
            </>
          )}
          {object.interaction && (
            <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs font-medium text-foreground">互动对象</div>
              <label className="mt-2 block text-xs text-muted-foreground mb-1">类型</label>
              <select
                value={object.interaction.kind}
                onChange={(e) => updateObject({ interaction: { ...object.interaction!, kind: e.target.value as NonNullable<EditorObject['interaction']>['kind'] } })}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="cta_button">按钮</option>
                <option value="branch_menu">分支菜单</option>
                <option value="single_answer">单选</option>
                <option value="multiple_answers">多选</option>
                <option value="score_card">计分卡</option>
              </select>
              <label className="mt-2 block text-xs text-muted-foreground mb-1">目标 URL</label>
              <input
                value={object.interaction.target_url || ''}
                onChange={(e) => updateObject({ interaction: { ...object.interaction!, target_url: e.target.value } })}
                placeholder="https://..."
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              />
              <label className="mt-2 block text-xs text-muted-foreground mb-1">选项</label>
              <textarea
                value={(object.interaction.options || []).join('\n')}
                onChange={(e) => updateObject({ interaction: { ...object.interaction!, options: e.target.value.split('\n').map((value) => value.trim()).filter(Boolean) } })}
                placeholder="每行一个选项"
                className="w-full h-20 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          {object.metadata && (
            <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs font-medium text-foreground">来源状态</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span>来源</span>
                <span className="text-foreground text-right">{
                  !object.metadata.source ? '手动' :
                  object.metadata.source === 'media' ? '媒体' :
                  object.metadata.source === 'motion' ? '动作' :
                  object.metadata.source === 'shape' ? '形状' :
                  object.metadata.source === 'record' ? '录制' :
                  object.metadata.source === 'interactivity' ? '互动' :
                  object.metadata.source
                }</span>
                {object.metadata.duration_sec !== undefined && (
                  <>
                    <span>时长</span>
                    <span className="text-foreground text-right">{object.metadata.duration_sec}s</span>
                  </>
                )}
              </div>
              {object.metadata.note && <p className="mt-2 text-[11px] text-muted-foreground leading-4">{object.metadata.note}</p>}
            </div>
          )}
          <label className="mt-3 flex items-center justify-between text-sm">
            可见
            <button
              type="button"
              onClick={() => updateObject({ visible: object.visible === false })}
              className="w-9 h-8 rounded-md flex items-center justify-center bg-secondary hover:bg-accent"
            >
              {object.visible === false ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            </button>
          </label>
          <NumberField label="X 位置" value={object.position.x} min={0} max={100} onChange={(value) => updateObject({ position: { ...object.position, x: value } })} />
          <NumberField label="Y 位置" value={object.position.y} min={0} max={100} onChange={(value) => updateObject({ position: { ...object.position, y: value } })} />
          <NumberField label="缩放" value={object.scale} min={10} max={260} onChange={(value) => updateObject({ scale: value })} />
          <NumberField label="旋转" value={object.rotation || 0} min={-180} max={180} onChange={(value) => updateObject({ rotation: value })} />
        </PanelSection>
      </div>
    );
  }

  return <EmptyObjectState />;
}
