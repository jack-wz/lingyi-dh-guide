import { libraryPayloadToBrandPack } from '@shared/brandPack';
import type { DSL, EditorObject, Segment } from '../store/editorStore';
import type { LibraryItem } from '../types/library';
import { parseDesignMarkdown } from '@shared/brandYaml';
import { resolveActiveLogo, resolveLogoSettings } from '@shared/brandLogo';
import { createEditorObject } from './editorObjects';

export function applyBrandLibraryItemToDsl(
  updateDsl: (updater: (dsl: DSL) => DSL) => void,
  item: LibraryItem,
  options?: { currentSegIndex?: number },
) {
  const pack = libraryPayloadToBrandPack(item);
  const payload = item.payload || {};
  const designMd = String(payload.design_markdown || '');
  const design = designMd
    ? parseDesignMarkdown(designMd)
    : { name: pack.name, description: '', colors: {}, typography: {}, rounded: {}, spacing: {} };
  const logoSettings = resolveLogoSettings(design, payload);
  const activeLogo = resolveActiveLogo(logoSettings);
  const focusSegIndex = options?.currentSegIndex ?? 0;

  updateDsl((draft) => {
    const brandLogoUrl = draft.globalConfig.brand_logo_url || activeLogo.url || '';
    const brandLogoLabel = activeLogo.label || pack.logoLabel;
    const segments = draft.segments.map((segment, index) => {
      const objects = [...(segment.objects || [])];
      if (index === focusSegIndex) {
        const logoIndex = objects.findIndex((object) => object.type === 'logo' || object.metadata?.note === 'brand-kit-logo');
        const logoPatch: Partial<EditorObject> = {
          label: brandLogoUrl ? 'Logo' : brandLogoLabel,
          asset_url: brandLogoUrl,
          position: { x: 12, y: 10 },
          scale: 72,
          style: {
            fill: pack.brandColor,
            textColor: pack.textColor,
            variant: pack.id,
            fontFamily: pack.defaultFontFamily,
          },
          metadata: { source: 'media', note: 'brand-kit-logo' },
        };
        if (logoIndex >= 0) {
          objects[logoIndex] = { ...objects[logoIndex], ...logoPatch };
        } else {
          objects.push(createEditorObject('logo', logoPatch, segment.duration_sec));
        }

        if (pack.titleText) {
          const titleIndex = objects.findIndex((object) => object.metadata?.note === 'brand-kit-title');
          const titlePatch: Partial<EditorObject> = {
            label: '品牌标题',
            text: pack.titleText,
            position: { x: 29, y: 72 },
            scale: 112,
            style: {
              fill: pack.brandColor,
              textColor: pack.textColor,
              variant: pack.id,
              fontFamily: pack.defaultFontFamily,
            },
            metadata: { source: 'media', note: 'brand-kit-title' },
          };
          if (titleIndex >= 0) {
            objects[titleIndex] = { ...objects[titleIndex], ...titlePatch };
          } else {
            objects.push(createEditorObject('text', titlePatch, segment.duration_sec));
          }
        }
      }

      return {
        ...segment,
        subtitle: {
          ...segment.subtitle,
          enabled: true,
          style_id: pack.subtitleStyle as Segment['subtitle']['style_id'],
          position: pack.subtitlePosition,
        },
        objects: objects.map((obj) => (
          obj.type === 'text' || obj.type === 'subtitle'
            ? { ...obj, style: { ...obj.style, fontFamily: obj.style?.fontFamily || pack.defaultFontFamily } }
            : obj
        )),
      };
    });

    return {
      ...draft,
      globalConfig: {
        ...draft.globalConfig,
        brand_pack_id: pack.id,
        brand_pack: item.payload,
        default_font_family: pack.defaultFontFamily,
        brand_color: pack.brandColor,
        background_color: pack.backgroundColor,
        ...(activeLogo.enabled && activeLogo.url ? { brand_logo_url: activeLogo.url } : {}),
      },
      segments,
    };
  });
}