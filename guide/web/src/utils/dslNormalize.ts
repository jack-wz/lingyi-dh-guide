import type { DSL } from '../store/editorStore';
import { getAssetMapFromDsl, resolveSegmentOverlays } from '@shared/assetResolver';

export function applyVariableSubstitution(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [name, value] of Object.entries(values)) {
    out = out.split(`{${name}}`).join(value ?? '');
  }
  return out;
}

export function buildVariableDefaults(dsl: DSL | null): Record<string, string> {
  if (!dsl?.variables?.length) return {};
  const out: Record<string, string> = {};
  for (const v of dsl.variables) {
    out[v.name] = v.default_value || v.example_value || '';
  }
  return out;
}

/** Resolve asset_key overlays for canvas/preview display. */
export function normalizeDslForDisplay(dsl: DSL): DSL {
  const assetMap = getAssetMapFromDsl(dsl);
  if (!Object.keys(assetMap).length) return dsl;
  return {
    ...dsl,
    segments: dsl.segments.map((seg) => ({
      ...seg,
      overlays: resolveSegmentOverlays(seg.overlays, assetMap),
    })),
  };
}