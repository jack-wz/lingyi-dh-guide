import type {
  AnimationPreset,
  ColorPreset,
  ElementLibraryItem,
  FrameTemplate,
  LayoutPreset,
  LayoutPresetElement,
  ShapePreset,
  SubtitleStylePreset,
  TextStylePreset,
} from '@shared/brandTypes';
import { fontFamilyCss, primaryFontFamily, type BrandFontFace, type FontCatalogItem } from '../../utils/brandFonts';
import FontFamilyPicker from './FontFamilyPicker';
import LogoUrlField from './LogoUrlField';
import { ColorField, NumberField, SelectField, TextArea, TextField, uid } from './primitives';

export interface BrandFormFontContext {
  catalog: FontCatalogItem[];
  packFonts: BrandFontFace[];
}

export const SHOT_TYPES = [
  'avatar_talking', 'product_showcase', 'text_card', 'comparison', 'countdown',
  'promo_banner', 'scene_transition', 'cta_button',
];

export const TEXT_ROLES = ['title', 'subtitle', 'body', 'caption', 'cta', 'price', 'badge'];

export function ColorPresetForm({ item, onChange }: { item: ColorPreset; onChange: (p: Partial<ColorPreset>) => void }) {
  return (
    <div className="space-y-3">
      <ColorField label="色值" value={item.value} onChange={(v) => onChange({ value: v })} />
      <div className="h-16 rounded-lg border border-border" style={{ background: item.value }} />
    </div>
  );
}

export function TextStyleForm({
  item,
  onChange,
  fontContext,
}: {
  item: TextStylePreset;
  onChange: (p: Partial<TextStylePreset>) => void;
  fontContext?: BrandFormFontContext;
}) {
  const previewFamily = item.fontFamily
    ? fontFamilyCss(primaryFontFamily(item.fontFamily))
    : 'inherit';
  return (
    <div className="grid grid-cols-2 gap-3">
      <SelectField label="角色" value={item.role || 'body'} options={TEXT_ROLES} onChange={(v) => onChange({ role: v })} />
      {fontContext ? (
        <div className="col-span-2">
          <FontFamilyPicker
            value={item.fontFamily}
            onChange={(v) => onChange({ fontFamily: v })}
            catalog={fontContext.catalog}
            packFonts={fontContext.packFonts}
            previewText={item.name || '文本样式预览'}
          />
        </div>
      ) : (
        <TextField label="字体" value={item.fontFamily || ''} onChange={(v) => onChange({ fontFamily: v })} />
      )}
      <NumberField label="字号" value={item.fontSize || 24} onChange={(v) => onChange({ fontSize: v })} />
      <NumberField label="字重" value={item.fontWeight || 400} onChange={(v) => onChange({ fontWeight: v })} />
      <ColorField label="文字颜色" value={item.color || '#111111'} onChange={(v) => onChange({ color: v })} />
      <TextField label="背景色" value={item.backgroundColor || ''} onChange={(v) => onChange({ backgroundColor: v || undefined })} />
      <NumberField label="行高" value={typeof item.lineHeight === 'number' ? item.lineHeight : 1.5} step={0.1} onChange={(v) => onChange({ lineHeight: v })} />
      <SelectField label="对齐" value={item.textAlign || 'left'} options={['left', 'center', 'right']} onChange={(v) => onChange({ textAlign: v })} />
      <div className="col-span-2 rounded-lg border border-border p-3 bg-secondary/30">
        <div className="text-[10px] text-muted-foreground mb-2">样式预览</div>
        <div style={{
          fontFamily: previewFamily,
          fontSize: `${Math.min((item.fontSize || 24) / 2.5, 28)}px`,
          fontWeight: item.fontWeight,
          color: item.color,
          backgroundColor: item.backgroundColor,
          padding: item.padding,
          borderRadius: typeof item.borderRadius === 'number' ? `${item.borderRadius}px` : item.borderRadius,
          textAlign: (item.textAlign as 'left' | 'center' | 'right') || 'left',
        }}>
          {item.name || '文本样式预览'}
        </div>
      </div>
    </div>
  );
}

export function SubtitleStyleForm({
  item,
  onChange,
  fontContext,
}: {
  item: SubtitleStylePreset;
  onChange: (p: Partial<SubtitleStylePreset>) => void;
  fontContext?: BrandFormFontContext;
}) {
  const previewFamily = item.fontFamily
    ? fontFamilyCss(primaryFontFamily(item.fontFamily))
    : undefined;
  return (
    <div className="grid grid-cols-2 gap-3">
      <TextField label="位置" value={item.position || 'bottom_center'} onChange={(v) => onChange({ position: v })} />
      {fontContext ? (
        <div className="col-span-2">
          <FontFamilyPicker
            value={item.fontFamily}
            onChange={(v) => onChange({ fontFamily: v })}
            catalog={fontContext.catalog}
            packFonts={fontContext.packFonts}
            previewText="示例字幕文本"
          />
        </div>
      ) : null}
      <NumberField label="字号" value={item.fontSize || 28} onChange={(v) => onChange({ fontSize: v })} />
      <ColorField label="文字颜色" value={item.color || '#ffffff'} onChange={(v) => onChange({ color: v })} />
      <TextField label="背景色" value={item.backgroundColor || ''} onChange={(v) => onChange({ backgroundColor: v || undefined })} />
      <TextField label="内边距" value={item.padding || ''} onChange={(v) => onChange({ padding: v || undefined })} />
      <NumberField label="圆角" value={item.borderRadius || 0} onChange={(v) => onChange({ borderRadius: v })} />
      <div className="col-span-2 rounded-lg border border-border p-3 bg-black/80 min-h-[80px] flex items-end justify-center">
        <span style={{
          fontFamily: previewFamily,
          fontSize: `${Math.min((item.fontSize || 28) / 2, 16)}px`,
          color: item.color,
          backgroundColor: item.backgroundColor || 'rgba(0,0,0,0.6)',
          padding: item.padding || '4px 12px',
          borderRadius: item.borderRadius ? `${item.borderRadius}px` : '4px',
        }}>
          示例字幕文本
        </span>
      </div>
    </div>
  );
}

export function AnimationPresetForm({ item, onChange }: { item: AnimationPreset; onChange: (p: Partial<AnimationPreset>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SelectField label="类型" value={item.type} options={['enter', 'exit', 'emphasis', 'loop']} onChange={(v) => onChange({ type: v })} />
      <TextField label="动画名" value={item.animation} onChange={(v) => onChange({ animation: v })} />
      <NumberField label="时长(s)" value={item.duration} step={0.1} onChange={(v) => onChange({ duration: v })} />
      <TextField label="缓动" value={item.easing} onChange={(v) => onChange({ easing: v })} />
    </div>
  );
}

export function ShapePresetForm({ item, onChange }: { item: ShapePreset; onChange: (p: Partial<ShapePreset>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SelectField label="形状" value={item.shape} options={['rect', 'circle', 'rounded_rect', 'line']} onChange={(v) => onChange({ shape: v })} />
      <ColorField label="填充" value={item.fill || '#ff5600'} onChange={(v) => onChange({ fill: v })} />
      <ColorField label="描边" value={item.stroke || '#111111'} onChange={(v) => onChange({ stroke: v })} />
      <NumberField label="描边宽度" value={item.strokeWidth || 0} onChange={(v) => onChange({ strokeWidth: v })} />
      <NumberField label="圆角" value={item.borderRadius || 0} onChange={(v) => onChange({ borderRadius: v })} />
      <div className="col-span-2 flex justify-center py-4">
        <div
          className="w-24 h-16 border-2"
          style={{
            background: item.fill,
            borderColor: item.stroke,
            borderWidth: item.strokeWidth,
            borderRadius: item.shape === 'circle' ? '50%' : `${item.borderRadius || 8}px`,
          }}
        />
      </div>
    </div>
  );
}

export function ElementLibraryForm({ item, onChange }: { item: ElementLibraryItem; onChange: (p: Partial<ElementLibraryItem>) => void }) {
  const isVisual = item.type === 'logo' || item.type === 'image';
  return (
    <div className="grid grid-cols-2 gap-3">
      <SelectField
        label="类型"
        value={item.type}
        options={['text', 'image', 'logo', 'shape', 'video', 'avatar']}
        onChange={(v) => onChange({
          type: v,
          category: v === 'logo' ? (item.category || 'logo') : item.category,
        })}
      />
      <TextField label="分类" value={item.category || ''} onChange={(v) => onChange({ category: v || undefined })} />
      <TextArea label="默认内容" value={item.defaultContent || ''} onChange={(v) => onChange({ defaultContent: v || undefined })} rows={2} />
      {isVisual ? (
        <div className="col-span-2">
          <LogoUrlField
            label="预览图 / Logo URL"
            value={item.previewUrl || ''}
            onChange={(url, meta) => onChange({
              previewUrl: url || undefined,
              name: meta?.name && !item.name?.trim() ? meta.name : item.name,
            })}
          />
        </div>
      ) : (
        <TextField label="预览 URL" value={item.previewUrl || ''} onChange={(v) => onChange({ previewUrl: v || undefined })} />
      )}
      {isVisual && item.previewUrl ? (
        <div className="col-span-2 flex justify-center py-2 rounded border border-border bg-secondary/20">
          <img src={item.previewUrl} alt="" className="max-h-16 max-w-[160px] object-contain" />
        </div>
      ) : null}
    </div>
  );
}

export function FrameListEditor({
  items,
  selectedId,
  onSelect,
  onChange,
}: {
  items: FrameTemplate[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (items: FrameTemplate[]) => void;
}) {
  const selected = items.find((i) => i.id === selectedId) || items[0] || null;
  const update = (patch: Partial<FrameTemplate>) => {
    if (!selected) return;
    onChange(items.map((i) => (i.id === selected.id ? { ...i, ...patch } : i)));
  };
  const add = () => {
    const next: FrameTemplate = {
      id: uid('frame'),
      name: '新镜头',
      shotType: 'avatar_talking',
      duration: 5,
      description: '',
      variables: [],
      defaultData: {},
    };
    onChange([...items, next]);
    onSelect(next.id);
  };
  const remove = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    onChange(next);
    if (selected?.id === id) onSelect(next[0]?.id || null);
  };

  return (
    <div className="flex min-h-[320px] gap-3">
      <div className="w-44 shrink-0 border-r border-border pr-2 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-muted-foreground">镜头</span>
          <button type="button" onClick={add} className="rounded bg-brand-blue px-1.5 py-0.5 text-[10px] text-white">添加</button>
        </div>
        <div className="space-y-1 max-h-[360px] overflow-y-auto">
          {items.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(f.id)}
              className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${
                selected?.id === f.id ? 'border-brand-blue bg-brand-blue/10' : 'border-border'
              }`}
            >
              <div className="font-medium truncate">{f.name}</div>
              <div className="text-[9px] text-muted-foreground">{f.shotType} · {f.duration}s</div>
            </button>
          ))}
        </div>
      </div>
      {selected ? (
        <div className="flex-1 space-y-3 overflow-y-auto">
          <div className="flex justify-between">
            <h4 className="text-sm font-semibold">{selected.name}</h4>
            <button type="button" onClick={() => remove(selected.id)} className="text-[11px] text-destructive">删除</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="ID" value={selected.id} onChange={(v) => update({ id: v })} />
            <TextField label="名称" value={selected.name} onChange={(v) => update({ name: v })} />
            <SelectField label="镜头类型" value={selected.shotType} options={SHOT_TYPES} onChange={(v) => update({ shotType: v })} />
            <NumberField label="时长(秒)" value={selected.duration} onChange={(v) => update({ duration: v })} />
          </div>
          <TextArea label="描述" value={selected.description || ''} onChange={(v) => update({ description: v })} rows={2} />
          <TextField
            label="变量（逗号分隔）"
            value={(selected.variables || []).join(', ')}
            onChange={(v) => update({ variables: v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
          />
          <TextField label="HyperFrames 模板" value={selected.hyperframesTemplate || ''} onChange={(v) => update({ hyperframesTemplate: v || undefined })} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">添加镜头模板</p>
      )}
    </div>
  );
}

export function LayoutPresetEditor({
  items,
  selectedId,
  onSelect,
  onChange,
}: {
  items: LayoutPreset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (items: LayoutPreset[]) => void;
}) {
  const selected = items.find((i) => i.id === selectedId) || items[0] || null;
  const update = (patch: Partial<LayoutPreset>) => {
    if (!selected) return;
    onChange(items.map((i) => (i.id === selected.id ? { ...i, ...patch } : i)));
  };
  const add = () => {
    const next: LayoutPreset = { id: uid('layout'), name: '新版式', type: 'product_showcase', elements: [] };
    onChange([...items, next]);
    onSelect(next.id);
  };
  const remove = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    onChange(next);
    if (selected?.id === id) onSelect(next[0]?.id || null);
  };
  const updateElements = (elements: LayoutPresetElement[]) => update({ elements });

  return (
    <div className="flex min-h-[320px] gap-3">
      <div className="w-44 shrink-0 border-r border-border pr-2 space-y-2">
        <div className="flex justify-between">
          <span className="text-xs text-muted-foreground">版式</span>
          <button type="button" onClick={add} className="rounded bg-brand-blue px-1.5 py-0.5 text-[10px] text-white">添加</button>
        </div>
        {items.map((l) => (
          <button key={l.id} type="button" onClick={() => onSelect(l.id)}
            className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${selected?.id === l.id ? 'border-brand-blue bg-brand-blue/10' : 'border-border'}`}>
            <div className="font-medium truncate">{l.name}</div>
            <div className="text-[9px] text-muted-foreground">{l.type}</div>
          </button>
        ))}
      </div>
      {selected ? (
        <div className="flex-1 space-y-3 overflow-y-auto">
          <div className="flex justify-between">
            <h4 className="text-sm font-semibold">{selected.name}</h4>
            <button type="button" onClick={() => remove(selected.id)} className="text-destructive text-[11px]">删除</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="ID" value={selected.id} onChange={(v) => update({ id: v })} />
            <TextField label="名称" value={selected.name} onChange={(v) => update({ name: v })} />
            <TextField label="类型" value={selected.type} onChange={(v) => update({ type: v })} />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium">布局元素 ({selected.elements?.length || 0})</span>
            <button type="button" onClick={() => updateElements([...(selected.elements || []), { type: 'text', anchor: 'center', x: 50, y: 50 }])}
              className="text-[10px] text-brand-blue">+ 元素</button>
          </div>
          {(selected.elements || []).map((el, idx) => (
            <div key={idx} className="rounded border border-border p-2 grid grid-cols-3 gap-2 text-[10px]">
              <TextField label="类型" value={el.type} onChange={(v) => {
                const next = [...(selected.elements || [])];
                next[idx] = { ...el, type: v };
                updateElements(next);
              }} />
              <TextField label="X" value={String(el.x ?? '')} onChange={(v) => {
                const next = [...(selected.elements || [])];
                next[idx] = { ...el, x: Number(v) || 0 };
                updateElements(next);
              }} />
              <TextField label="Y" value={String(el.y ?? '')} onChange={(v) => {
                const next = [...(selected.elements || [])];
                next[idx] = { ...el, y: Number(v) || 0 };
                updateElements(next);
              }} />
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">添加版式</p>}
    </div>
  );
}

