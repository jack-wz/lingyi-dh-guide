import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconX } from './Icons';
import type { BrandAssetDoc, BrandPresets, DesignSystem } from '@shared/brandTypes';
import { EMPTY_PRESETS } from '@shared/brandTypes';
import {
  designToMarkdown,
  frameToMarkdown,
  parseBrandAssetDocs,
} from '@shared/brandYaml';
import type { LibraryItem } from '../types/library';
import BrandPreviewPanel from './brand-editor/BrandPreviewPanel';
import FontListEditor from './brand-editor/FontListEditor';
import { useBrandFontFaces } from '../utils/brandFonts';
import {
  AnimationPresetForm,
  ColorPresetForm,
  ElementLibraryForm,
  FrameListEditor,
  LayoutPresetEditor,
  ShapePresetForm,
  SubtitleStyleForm,
  TextStyleForm,
  type BrandFormFontContext,
} from './brand-editor/forms';
import SubBrandLogoEditor from './brand-editor/SubBrandLogoEditor';
import {
  attachLogoToDesign,
  defaultLogoSettings,
  resolveLogoSettings,
  logoSettingsToPayload,
} from '@shared/brandLogo';
import { SimpleListEditor, TextArea, TextField, TokenEditor, uid } from './brand-editor/primitives';
import type { BrandLogoSettings } from '@shared/brandTypes';
import { useFontCatalog } from '../utils/brandFonts';
import { SECTIONS, type EditorMode, type VisualSection } from './brand-editor/types';
import { mergeBrandLookBundlePayload } from '@shared/brandLookBundleExport';
import BrandLookPresetEditor, {
  brandPayloadToLookPresetSettings,
  defaultBrandLookPresetSettings,
  lookPresetSettingsToPayload,
  type BrandLookPresetSettings,
} from './brand-editor/BrandLookPresetEditor';

export type BrandEditorMode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: BrandEditorMode;
  itemId?: string;
  onClose: () => void;
  onSaved?: () => void;
}

function emptyDoc(name = '新品牌包'): BrandAssetDoc {
  return {
    design: {
      name,
      description: '',
      colors: { 'brand-primary': '#2563eb', 'brand-bg': '#f6f8fb', 'brand-text': '#ffffff' },
      typography: { fonts: [] },
      rounded: { sm: 4, md: 8, lg: 12 },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
    },
    frames: [],
    presets: { ...EMPTY_PRESETS },
    design_markdown: '',
    frame_markdown: '',
  };
}

function payloadToDoc(item: LibraryItem): BrandAssetDoc {
  const p = item.payload || {};
  const designMd = String(p.design_markdown || '');
  const frameMd = String(p.frame_markdown || '');
  if (designMd) return parseBrandAssetDocs(designMd, frameMd);
  return {
    design: {
      name: item.name,
      description: item.description || '',
      colors: (p.tokens as { colors?: Record<string, string> })?.colors || {},
      typography: (p.tokens as { typography?: Record<string, unknown> })?.typography || {},
      rounded: (p.tokens as { rounded?: Record<string, number> })?.rounded || {},
      spacing: (p.tokens as { spacing?: Record<string, number> })?.spacing || {},
    },
    frames: (p.frames as BrandAssetDoc['frames']) || [],
    presets: { ...EMPTY_PRESETS, ...(p.presets as Partial<BrandPresets>) },
    design_markdown: designMd,
    frame_markdown: frameMd,
  };
}

async function attachFontUrlsFromCatalog(doc: BrandAssetDoc): Promise<BrandAssetDoc> {
  try {
    const res = await fetch('/api/library/brand/fonts');
    if (!res.ok) return doc;
    const data = await res.json() as { fonts: Array<{ family: string; url: string; name: string; style?: string; class?: string }> };
    const map = new Map(data.fonts.map((f) => [f.family, f]));
    const raw = Array.isArray((doc.design.typography as { fonts?: Array<{ name: string; family: string; style?: string; class?: string; url?: string }> }).fonts)
      ? (doc.design.typography as { fonts: Array<{ name: string; family: string; style?: string; class?: string; url?: string }> }).fonts
      : [];
    const fonts = raw.map((f) => {
      const hit = map.get(f.family);
      if (!hit) return f;
      return { ...f, url: f.url || hit.url, name: f.name || hit.name, style: f.style || hit.style, class: f.class || hit.class };
    });
    return { ...doc, design: { ...doc.design, typography: { ...doc.design.typography, fonts } } };
  } catch {
    return doc;
  }
}

function buildDocMarkdown(doc: BrandAssetDoc, logoSettings: BrandLogoSettings): BrandAssetDoc {
  const design = attachLogoToDesign(doc.design, logoSettings);
  return {
    ...doc,
    design,
    design_markdown: designToMarkdown(design),
    frame_markdown: frameToMarkdown(doc.frames, doc.presets),
  };
}

function docToPayload(
  doc: BrandAssetDoc,
  prev: Record<string, unknown>,
  logoSettings: BrandLogoSettings,
  lookPresetSettings: BrandLookPresetSettings,
  brandPayloadPatch: Record<string, unknown> = {},
) {
  const synced = buildDocMarkdown(doc, logoSettings);
  const fonts = Array.isArray((synced.design.typography as { fonts?: unknown[] }).fonts)
    ? (synced.design.typography as { fonts: unknown[] }).fonts
    : [];
  return {
    ...prev,
    ...brandPayloadPatch,
    ...logoSettingsToPayload(logoSettings),
    design_markdown: synced.design_markdown,
    frame_markdown: synced.frame_markdown,
    brand_color: synced.design.colors['digital-orange'] || synced.design.colors['brand-primary'] || doc.presets.colorPalette[0]?.value || prev.brand_color,
    background_color: synced.design.colors['soft-pink'] || synced.design.colors['brand-bg'] || prev.background_color,
    text_color: synced.design.colors['light-text'] || synced.design.colors['brand-text'] || prev.text_color,
    logo_label: logoSettings.logoLabel || synced.design.name.slice(0, 4) || '品牌',
    tokens: {
      colors: synced.design.colors,
      typography: synced.design.typography,
      rounded: synced.design.rounded,
      spacing: synced.design.spacing,
    },
    presets: synced.presets,
    frames: synced.frames,
    fonts,
    ...lookPresetSettingsToPayload(lookPresetSettings),
  };
}

export default function BrandAssetEditor({ open, mode, itemId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [section, setSection] = useState<VisualSection>('basic');
  const [selectedIds, setSelectedIds] = useState<Record<string, string | null>>({});
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [doc, setDoc] = useState<BrandAssetDoc | null>(null);
  const [designMd, setDesignMd] = useState('');
  const [frameMd, setFrameMd] = useState('');
  const [logoSettings, setLogoSettings] = useState<BrandLogoSettings>(defaultLogoSettings());
  const [lookPresetSettings, setLookPresetSettings] = useState<BrandLookPresetSettings>(
    defaultBrandLookPresetSettings(),
  );
  const [brandPayloadPatch, setBrandPayloadPatch] = useState<Record<string, unknown>>({});
  const { catalog: fontCatalog } = useFontCatalog();

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    setEditorMode('visual');
    setSection('basic');
    setSelectedIds({});
    try {
      if (mode === 'edit' && itemId) {
        const res = await fetch(`/api/library/${itemId}`);
        if (!res.ok) throw new Error('加载失败');
        const data = await res.json() as LibraryItem;
        let nextDoc = payloadToDoc(data);
        nextDoc = await attachFontUrlsFromCatalog(nextDoc);
        setItem(data);
        setDoc(nextDoc);
        setLogoSettings(resolveLogoSettings(nextDoc.design, data.payload || {}));
        setLookPresetSettings(brandPayloadToLookPresetSettings(data.payload || {}));
        setBrandPayloadPatch({});
        setDesignMd(nextDoc.design_markdown);
        setFrameMd(nextDoc.frame_markdown);
      } else {
        const tplRes = await fetch('/api/library/brand/local-template');
        if (tplRes.ok) {
          const tpl = await tplRes.json() as { designMd: string; frameMd: string };
          let nextDoc = parseBrandAssetDocs(tpl.designMd, tpl.frameMd);
          nextDoc.design.name = `品牌包 ${new Date().toLocaleDateString('zh-CN')}`;
          nextDoc = await attachFontUrlsFromCatalog(nextDoc);
          setItem(null);
          setDoc(nextDoc);
          setLogoSettings(defaultLogoSettings(nextDoc.design.name));
          setLookPresetSettings(defaultBrandLookPresetSettings());
          setDesignMd(designToMarkdown(nextDoc.design));
          setFrameMd(frameToMarkdown(nextDoc.frames, nextDoc.presets));
        } else {
          const nextDoc = emptyDoc();
          setItem(null);
          setDoc(nextDoc);
          setLogoSettings(defaultLogoSettings(nextDoc.design.name));
          setLookPresetSettings(defaultBrandLookPresetSettings());
          setDesignMd(designToMarkdown(nextDoc.design));
          setFrameMd(frameToMarkdown(nextDoc.frames, nextDoc.presets));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [open, mode, itemId]);

  useEffect(() => { void load(); }, [load]);

  const syncFromMarkdown = () => {
    try {
      const parsed = parseBrandAssetDocs(designMd, frameMd);
      setDoc(parsed);
      setLogoSettings(resolveLogoSettings(parsed.design, item?.payload || {}));
      setError('');
    } catch {
      setError('Markdown 解析失败，请检查 YAML 格式');
    }
  };

  const syncToMarkdown = () => {
    if (!doc) return;
    const synced = buildDocMarkdown(doc, logoSettings);
    setDesignMd(synced.design_markdown);
    setFrameMd(synced.frame_markdown);
  };

  const switchEditorMode = (next: EditorMode) => {
    if (next === 'visual' && editorMode === 'markdown') syncFromMarkdown();
    if (next === 'markdown' && editorMode === 'visual' && doc) syncToMarkdown();
    setEditorMode(next);
  };

  const updateDesign = (patch: Partial<DesignSystem>) => {
    if (!doc) return;
    setDoc({ ...doc, design: { ...doc.design, ...patch } });
  };

  const updatePresets = (patch: Partial<BrandPresets>) => {
    if (!doc) return;
    setDoc({ ...doc, presets: { ...doc.presets, ...patch } });
  };

  const updateFrames = (frames: BrandAssetDoc['frames']) => {
    if (!doc) return;
    setDoc({ ...doc, frames });
  };

  const fonts = useMemo(() => {
    const typo = doc?.design.typography as { fonts?: Array<{ name: string; family: string; style?: string; class?: string; url?: string }> };
    return typo?.fonts || [];
  }, [doc]);

  useBrandFontFaces(fonts);

  const fontContext = useMemo<BrandFormFontContext>(() => ({
    catalog: fontCatalog,
    packFonts: fonts,
  }), [fontCatalog, fonts]);

  const save = async () => {
    if (!doc) return;
    setSaving(true);
    setError('');
    try {
      const parsedMd = editorMode === 'markdown' ? parseBrandAssetDocs(designMd, frameMd) : doc;
      const logoForSave = editorMode === 'markdown'
        ? resolveLogoSettings(parsedMd.design, item?.payload || {})
        : logoSettings;
      const finalDoc = buildDocMarkdown(parsedMd, logoForSave);
      const payload = docToPayload(finalDoc, item?.payload || {}, logoForSave, lookPresetSettings, brandPayloadPatch);

      if (mode === 'edit' && itemId) {
        const res = await fetch(`/api/library/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: finalDoc.design.name,
            description: finalDoc.design.description,
            payload,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || '保存失败');
      } else {
        const res = await fetch('/api/library/brand/import-md', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: finalDoc.design.name,
            design_md: finalDoc.design_markdown,
            frame_md: finalDoc.frame_markdown,
            ...lookPresetSettingsToPayload(lookPresetSettings),
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || '创建失败');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const renderSection = () => {
    if (!doc) return null;
    switch (section) {
      case 'motionPresets':
        return (
          <BrandLookPresetEditor
            settings={lookPresetSettings}
            onChange={setLookPresetSettings}
            brandName={doc.design.name}
            brandPayload={{
              ...(item?.payload || {}),
              ...brandPayloadPatch,
              ...lookPresetSettingsToPayload(lookPresetSettings),
            }}
            onBrandPayloadImport={(patch) => setBrandPayloadPatch((prev) => mergeBrandLookBundlePayload(prev, patch))}
          />
        );
      case 'basic':
        return (
          <div className="space-y-4">
            <div className="space-y-3 max-w-lg">
              <TextField
                label="品牌名称"
                value={doc.design.name}
                onChange={(v) => {
                  updateDesign({ name: v });
                  setLogoSettings((prev) => ({ ...prev, logoLabel: v.slice(0, 4) || prev.logoLabel }));
                }}
              />
              <TextArea label="描述" value={doc.design.description} onChange={(v) => updateDesign({ description: v })} rows={3} />
            </div>
            <SubBrandLogoEditor
              settings={logoSettings}
              elementLibrary={doc.presets.elementLibrary}
              onChange={(next) => {
                setLogoSettings(next);
                updateDesign({ brandLogo: next });
              }}
            />
          </div>
        );
      case 'colors':
        return (
          <TokenEditor
            title="品牌颜色"
            values={doc.design.colors}
            onChange={(colors) => updateDesign({ colors: colors as Record<string, string> })}
            valueType="color"
          />
        );
      case 'tokens':
        return (
          <div className="space-y-6">
            <TokenEditor title="圆角 rounded" values={doc.design.rounded} onChange={(rounded) => updateDesign({ rounded: rounded as Record<string, number | string> })} />
            <TokenEditor title="间距 spacing" values={doc.design.spacing} onChange={(spacing) => updateDesign({ spacing: spacing as Record<string, number | string> })} />
          </div>
        );
      case 'fonts':
        return (
          <FontListEditor
            fonts={fonts}
            onChange={(nextFonts) => updateDesign({ typography: { ...doc.design.typography, fonts: nextFonts } })}
          />
        );
      case 'frames':
        return (
          <FrameListEditor
            items={doc.frames}
            selectedId={selectedIds.frames || null}
            onSelect={(id) => setSelectedIds((p) => ({ ...p, frames: id }))}
            onChange={updateFrames}
          />
        );
      case 'palette':
        return (
          <SimpleListEditor
            title="色板"
            items={doc.presets.colorPalette}
            selectedId={selectedIds.palette || null}
            onSelect={(id) => setSelectedIds((p) => ({ ...p, palette: id }))}
            onChange={(colorPalette) => updatePresets({ colorPalette })}
            defaultItem={() => ({ id: uid('color'), name: '新颜色', value: '#2563eb' })}
            renderForm={(item, onPatch) => <ColorPresetForm item={item} onChange={onPatch} />}
          />
        );
      case 'textStyles':
        return (
          <SimpleListEditor
            title="文本样式"
            items={doc.presets.textStyles}
            selectedId={selectedIds.textStyles || null}
            onSelect={(id) => setSelectedIds((p) => ({ ...p, textStyles: id }))}
            onChange={(textStyles) => updatePresets({ textStyles })}
            defaultItem={() => ({
              id: uid('text'),
              name: '新文本样式',
              role: 'body',
              fontFamily: 'Inter, sans-serif',
              fontSize: 30,
              fontWeight: 400,
              color: '#111111',
              lineHeight: 1.5,
              textAlign: 'left',
            })}
            renderForm={(item, onPatch) => <TextStyleForm item={item} onChange={onPatch} fontContext={fontContext} />}
          />
        );
      case 'subtitleStyles':
        return (
          <SimpleListEditor
            title="字幕样式"
            items={doc.presets.subtitleStyles}
            selectedId={selectedIds.subtitleStyles || null}
            onSelect={(id) => setSelectedIds((p) => ({ ...p, subtitleStyles: id }))}
            onChange={(subtitleStyles) => updatePresets({ subtitleStyles })}
            defaultItem={() => ({
              id: uid('sub'),
              name: '新字幕样式',
              position: 'bottom_center',
              fontSize: 32,
              color: '#ffffff',
              backgroundColor: 'rgba(0,0,0,0.65)',
              padding: '6px 14px',
              borderRadius: 6,
            })}
            renderForm={(item, onPatch) => <SubtitleStyleForm item={item} onChange={onPatch} fontContext={fontContext} />}
          />
        );
      case 'animations':
        return (
          <SimpleListEditor
            title="动画"
            items={doc.presets.animationPresets}
            selectedId={selectedIds.animations || null}
            onSelect={(id) => setSelectedIds((p) => ({ ...p, animations: id }))}
            onChange={(animationPresets) => updatePresets({ animationPresets })}
            defaultItem={() => ({ id: uid('anim'), name: '新动画', type: 'enter', animation: 'fadeIn', duration: 0.6, easing: 'ease-out' })}
            renderForm={(item, onPatch) => <AnimationPresetForm item={item} onChange={onPatch} />}
          />
        );
      case 'layouts':
        return (
          <LayoutPresetEditor
            items={doc.presets.layoutPresets}
            selectedId={selectedIds.layouts || null}
            onSelect={(id) => setSelectedIds((p) => ({ ...p, layouts: id }))}
            onChange={(layoutPresets) => updatePresets({ layoutPresets })}
          />
        );
      case 'shapes':
        return (
          <SimpleListEditor
            title="形状"
            items={doc.presets.shapePresets}
            selectedId={selectedIds.shapes || null}
            onSelect={(id) => setSelectedIds((p) => ({ ...p, shapes: id }))}
            onChange={(shapePresets) => updatePresets({ shapePresets })}
            defaultItem={() => ({ id: uid('shape'), name: '新形状', shape: 'rect', fill: '#ff5600', stroke: '#111111', strokeWidth: 0 })}
            renderForm={(item, onPatch) => <ShapePresetForm item={item} onChange={onPatch} />}
          />
        );
      case 'elements':
        return (
          <SimpleListEditor
            title="元素"
            items={doc.presets.elementLibrary}
            selectedId={selectedIds.elements || null}
            onSelect={(id) => setSelectedIds((p) => ({ ...p, elements: id }))}
            onChange={(elementLibrary) => updatePresets({ elementLibrary })}
            defaultItem={() => ({ id: uid('elem'), name: '新元素', type: 'text', category: 'general', defaultContent: '', previewUrl: '' })}
            renderForm={(item, onPatch) => <ElementLibraryForm item={item} onChange={onPatch} />}
          />
        );
      default:
        return null;
    }
  };

  if (!open) return null;

  const title = mode === 'create' ? '新建品牌包' : `编辑品牌包 · ${doc?.design.name || item?.name || ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-6xl h-[88vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold truncate flex-1">{title}</h2>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button type="button" onClick={() => switchEditorMode('visual')}
              className={`px-3 py-1.5 ${editorMode === 'visual' ? 'bg-brand-blue text-white' : 'text-muted-foreground hover:bg-accent'}`}>
              可视化
            </button>
            <button type="button" onClick={() => switchEditorMode('markdown')}
              className={`px-3 py-1.5 ${editorMode === 'markdown' ? 'bg-brand-blue text-white' : 'text-muted-foreground hover:bg-accent'}`}>
              Markdown
            </button>
          </div>
          <button type="button" onClick={save} disabled={saving || loading || !doc}
            className="h-8 px-4 rounded-md bg-brand-blue text-white text-xs disabled:opacity-50">
            {saving ? '保存中...' : mode === 'create' ? '创建' : '保存'}
          </button>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-accent">
            <IconX size={16} />
          </button>
        </header>

        {error && (
          <div className="shrink-0 px-4 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20">{error}</div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">加载中...</div>
        ) : !doc ? (
          <div className="flex-1 flex items-center justify-center text-sm text-destructive">无法加载品牌数据</div>
        ) : editorMode === 'markdown' ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-0">
            <div className="flex flex-col min-h-0 border-r border-border">
              <div className="px-3 py-2 text-xs font-medium border-b border-border bg-secondary/40">design.md</div>
              <textarea value={designMd} onChange={(e) => setDesignMd(e.target.value)}
                className="flex-1 min-h-0 p-3 font-mono text-[11px] bg-background resize-none outline-none" spellCheck={false} />
            </div>
            <div className="flex flex-col min-h-0">
              <div className="px-3 py-2 text-xs font-medium border-b border-border bg-secondary/40">frame.md</div>
              <textarea value={frameMd} onChange={(e) => setFrameMd(e.target.value)}
                className="flex-1 min-h-0 p-3 font-mono text-[11px] bg-background resize-none outline-none" spellCheck={false} />
            </div>
            <div className="md:col-span-2 px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-secondary/20">
              保存时 Markdown 会解析并同步到可视化数据；可视化编辑保存时也会自动生成对应 Markdown。
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex">
            <nav className="w-36 shrink-0 border-r border-border overflow-y-auto p-2 bg-secondary/20">
              {SECTIONS.map((s, i, arr) => {
                const showGroup = i === 0 || arr[i - 1].group !== s.group;
                return (
                  <div key={s.id}>
                    {showGroup && <div className="px-2 pt-2 pb-1 text-[9px] font-medium text-muted-foreground uppercase tracking-wide">{s.group}</div>}
                    <button type="button" onClick={() => setSection(s.id)}
                      data-testid={`brand-section-${s.id}`}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs mb-0.5 ${
                        section === s.id ? 'bg-brand-blue/15 text-brand-blue font-medium' : 'text-muted-foreground hover:bg-accent/60'
                      }`}>
                      {s.label}
                    </button>
                  </div>
                );
              })}
            </nav>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">{renderSection()}</div>
            <div className="w-52 shrink-0 border-l border-border bg-secondary/10 p-3 hidden lg:flex flex-col min-h-0">
              <BrandPreviewPanel doc={doc} section={section} selectedIds={selectedIds} logoSettings={logoSettings} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}