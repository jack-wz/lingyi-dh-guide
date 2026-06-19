/** Guide-native adapters for HyperFrames global overlays (grain, vignette). */

export type HfGlobalOverlayType = 'hf-grain' | 'hf-vignette';

export interface HfGlobalOverlayItem {
  type: HfGlobalOverlayType;
  enabled: boolean;
  /** Grain texture opacity (0.05–0.35). */
  opacity?: number;
  /** Vignette edge darkness (0.3–0.9). */
  intensity?: number;
  /** Transparent center radius percent (35–55). */
  vignette_size?: number;
}

export interface HfGlobalOverlayRenderContext {
  totalDuration: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface HfGlobalOverlayClipOutput {
  html: string;
  css: string;
}

export const HF_GLOBAL_OVERLAY_TYPES = new Set<HfGlobalOverlayType>(['hf-grain', 'hf-vignette']);

export const DEFAULT_HF_GLOBAL_OVERLAYS: HfGlobalOverlayItem[] = [
  { type: 'hf-grain', enabled: false, opacity: 0.15 },
  { type: 'hf-vignette', enabled: false, intensity: 0.7, vignette_size: 45 },
];

export function normalizeHfGlobalOverlays(
  items: HfGlobalOverlayItem[] | undefined,
): HfGlobalOverlayItem[] {
  const source = Array.isArray(items) ? items : [];
  return DEFAULT_HF_GLOBAL_OVERLAYS.map((defaults) => {
    const found = source.find((item) => item.type === defaults.type);
    return {
      ...defaults,
      ...found,
      enabled: Boolean(found?.enabled),
    };
  });
}

export function getEnabledHfGlobalOverlays(
  items: HfGlobalOverlayItem[] | undefined,
): HfGlobalOverlayItem[] {
  return normalizeHfGlobalOverlays(items).filter((item) => item.enabled);
}

export function dslUsesHyperframesGlobalOverlays(dsl: {
  globalConfig?: { hf_overlays?: HfGlobalOverlayItem[] };
}): boolean {
  return getEnabledHfGlobalOverlays(dsl.globalConfig?.hf_overlays).length > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function renderGrainOverlay(
  item: HfGlobalOverlayItem,
  ctx: HfGlobalOverlayRenderContext,
): HfGlobalOverlayClipOutput {
  const opacity = clamp(Number(item.opacity ?? 0.15), 0.05, 0.35);
  const html = `
    <div class="clip hf-global-overlay hf-global-grain" data-hf-component="grain-overlay"
         id="hf-global-grain" data-start="0" data-duration="${ctx.totalDuration}" data-track-index="9"
         style="position:absolute;inset:0;pointer-events:none;z-index:100;overflow:hidden;">
      <div class="grain-texture"></div>
    </div>`;

  const css = `
    .hf-global-grain .grain-texture {
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      opacity: ${opacity};
      animation: hf-grain-noise 0.5s steps(1) infinite;
    }
    @keyframes hf-grain-noise {
      0%, 100% { transform: translate(0, 0); }
      10% { transform: translate(-5%, -5%); }
      20% { transform: translate(-10%, 5%); }
      30% { transform: translate(5%, -10%); }
      40% { transform: translate(-5%, 15%); }
      50% { transform: translate(-10%, 5%); }
      60% { transform: translate(15%, 0); }
      70% { transform: translate(0, 10%); }
      80% { transform: translate(-15%, 0); }
      90% { transform: translate(10%, 5%); }
    }
  `;

  return { html, css };
}

export function renderVignetteOverlay(
  item: HfGlobalOverlayItem,
  ctx: HfGlobalOverlayRenderContext,
): HfGlobalOverlayClipOutput {
  const intensity = clamp(Number(item.intensity ?? 0.7), 0.3, 0.9);
  const size = clamp(Number(item.vignette_size ?? 45), 35, 55);
  const edgeAlpha = intensity.toFixed(2);

  const html = `
    <div class="clip hf-global-overlay hf-global-vignette" data-hf-component="vignette"
         id="hf-global-vignette" data-start="0" data-duration="${ctx.totalDuration}" data-track-index="8"
         style="position:absolute;inset:0;pointer-events:none;z-index:90;
                --vignette-size:${size}%;--vignette-color:rgba(0,0,0,${edgeAlpha});"></div>`;

  const css = `
    .hf-global-vignette {
      background: radial-gradient(
        ellipse at center,
        transparent var(--vignette-size, 45%),
        var(--vignette-color, rgba(0, 0, 0, 0.7)) 100%
      );
    }
  `;

  return { html, css };
}

export function renderHfGlobalOverlayClips(
  items: HfGlobalOverlayItem[] | undefined,
  ctx: HfGlobalOverlayRenderContext,
): { html: string; css: string } {
  const enabled = getEnabledHfGlobalOverlays(items);
  const clips: HfGlobalOverlayClipOutput[] = [];
  for (const item of enabled) {
    if (item.type === 'hf-grain') clips.push(renderGrainOverlay(item, ctx));
    if (item.type === 'hf-vignette') clips.push(renderVignetteOverlay(item, ctx));
  }
  return {
    html: clips.map((clip) => clip.html).join('\n'),
    css: clips.map((clip) => clip.css).join('\n'),
  };
}