import { useState } from 'react';
import type { BrandLogoSettings, ElementLibraryItem, SubBrandConfig } from '@shared/brandTypes';
import { TextField, uid } from './primitives';
import LogoUrlField from './LogoUrlField';

export { defaultLogoSettings, logoSettingsFromPayload, logoSettingsToPayload, resolveActiveLogo } from '@shared/brandLogo';

interface Props {
  settings: BrandLogoSettings;
  elementLibrary: ElementLibraryItem[];
  onChange: (settings: BrandLogoSettings) => void;
}

const logoElements = (items: ElementLibraryItem[]) =>
  items.filter((e) => e.type === 'logo' || e.type === 'image' || e.category === 'logo');

export default function SubBrandLogoEditor({ settings, elementLibrary, onChange }: Props) {
  const logos = logoElements(elementLibrary);
  const [linkTarget, setLinkTarget] = useState<'main' | string | null>(null);

  const patchMain = (p: Partial<BrandLogoSettings>) => onChange({ ...settings, ...p });

  const patchSub = (id: string, p: Partial<SubBrandConfig>) => {
    onChange({
      ...settings,
      subBrands: settings.subBrands.map((s) => (s.id === id ? { ...s, ...p } : s)),
    });
  };

  const addSub = () => {
    const next: SubBrandConfig = {
      id: uid('subbrand'),
      name: `子品牌 ${settings.subBrands.length + 1}`,
      enabled: true,
      logoUrl: '',
      logoLabel: '',
    };
    onChange({ ...settings, subBrands: [...settings.subBrands, next] });
  };

  const removeSub = (id: string) => {
    onChange({
      ...settings,
      subBrands: settings.subBrands.filter((s) => s.id !== id),
      activeSubBrandId: settings.activeSubBrandId === id ? null : settings.activeSubBrandId,
    });
  };

  const applyElement = (elementId: string) => {
    const el = elementLibrary.find((e) => e.id === elementId);
    if (!el || !linkTarget) return;
    const url = el.previewUrl || '';
    const label = el.name || '';
    if (linkTarget === 'main') {
      patchMain({ elementId, logoUrl: url, logoLabel: label || settings.logoLabel });
    } else {
      patchSub(linkTarget, { elementId, logoUrl: url, logoLabel: label });
    }
    setLinkTarget(null);
  };

  const applyMainLogo = (url: string, meta?: { name?: string }) => {
    patchMain({
      logoUrl: url,
      logoLabel: meta?.name?.slice(0, 8) || settings.logoLabel,
      elementId: url ? '' : settings.elementId,
    });
  };

  const applySubLogo = (id: string, url: string, meta?: { name?: string }) => {
    patchSub(id, {
      logoUrl: url,
      logoLabel: meta?.name?.slice(0, 8) || undefined,
      elementId: url ? '' : undefined,
    });
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">主品牌 Logo</span>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => patchMain({ enabled: e.target.checked })}
              className="rounded border-border"
            />
            启用
          </label>
        </div>
        <TextField label="Logo 文案" value={settings.logoLabel} onChange={(v) => patchMain({ logoLabel: v })} />
        <LogoUrlField label="Logo 图片" value={settings.logoUrl || ''} onChange={applyMainLogo} />
        {logos.length > 0 ? (
          <label className="block text-[11px] text-muted-foreground">
            关联元素库
            <select
              value={linkTarget === 'main' ? settings.elementId || '' : ''}
              onFocus={() => setLinkTarget('main')}
              onChange={(e) => {
                setLinkTarget('main');
                applyElement(e.target.value);
              }}
              className="mt-1 block w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="">选择 Logo 元素...</option>
              {logos.map((el) => (
                <option key={el.id} value={el.id}>{el.name} ({el.id})</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-[10px] text-muted-foreground">可在「元素库」添加 type=logo 的元素后在此关联调用。</p>
        )}
        <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-3 bg-secondary/20 min-h-[72px]">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="h-12 max-w-[120px] object-contain" />
          ) : (
            <span className="text-lg font-semibold px-3 py-1 rounded bg-brand-blue/20 text-brand-blue">
              {(settings.logoLabel || '品牌').slice(0, 4)}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">主 Logo 预览</span>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">子品牌</span>
          <button type="button" onClick={addSub} className="rounded bg-brand-blue px-2 py-0.5 text-[10px] text-white">
            添加子品牌
          </button>
        </div>
        {settings.subBrands.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">添加子品牌后可为每个子品牌配置独立 Logo；启用 + 默认调用后，应用品牌包时自动带入编辑器。</p>
        ) : null}
        {settings.subBrands.map((sub) => (
          <div key={sub.id} className="rounded-md border border-border p-3 space-y-2 bg-background">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={sub.enabled}
                  onChange={(e) => patchSub(sub.id, { enabled: e.target.checked })}
                  className="rounded border-border"
                />
                启用
              </label>
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                <input
                  type="radio"
                  name="active-sub-brand"
                  checked={settings.activeSubBrandId === sub.id}
                  onChange={() => patchMain({ activeSubBrandId: sub.id })}
                />
                默认调用
              </label>
              <button type="button" onClick={() => removeSub(sub.id)} className="text-[10px] text-destructive">删除</button>
            </div>
            <TextField label="子品牌名称" value={sub.name} onChange={(v) => patchSub(sub.id, { name: v })} />
            <TextField label="Logo 文案" value={sub.logoLabel || ''} onChange={(v) => patchSub(sub.id, { logoLabel: v })} />
            <LogoUrlField
              label={`${sub.name} Logo`}
              value={sub.logoUrl || ''}
              onChange={(url, meta) => applySubLogo(sub.id, url, meta)}
            />
            {logos.length > 0 ? (
              <label className="block text-[11px] text-muted-foreground">
                关联元素库
                <select
                  value={sub.elementId || ''}
                  onChange={(e) => {
                    setLinkTarget(sub.id);
                    const el = elementLibrary.find((x) => x.id === e.target.value);
                    if (el) patchSub(sub.id, { elementId: el.id, logoUrl: el.previewUrl || '', logoLabel: el.name });
                  }}
                  className="mt-1 block w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="">选择 Logo 元素...</option>
                  {logos.map((el) => (
                    <option key={el.id} value={el.id}>{el.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {sub.logoUrl ? (
                <img src={sub.logoUrl} alt="" className="h-8 max-w-[80px] object-contain" />
              ) : (
                <span className="px-2 py-0.5 rounded bg-secondary">{(sub.logoLabel || sub.name).slice(0, 4)}</span>
              )}
              <span>{sub.enabled ? '已启用' : '已关闭'}{settings.activeSubBrandId === sub.id ? ' · 默认' : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}