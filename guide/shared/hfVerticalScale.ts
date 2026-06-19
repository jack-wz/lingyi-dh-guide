/** Scale HyperFrames caption / overlay layout for non-reference canvases (default 1080×1920). */

export const HF_REFERENCE_WIDTH = 1080;
export const HF_REFERENCE_HEIGHT = 1920;

export function hfScaleFactor(canvasWidth: number, canvasHeight: number): number {
  const w = Math.max(1, canvasWidth);
  const h = Math.max(1, canvasHeight);
  const heightScale = h / HF_REFERENCE_HEIGHT;
  const widthScale = w / HF_REFERENCE_WIDTH;
  return Math.min(heightScale, widthScale);
}

export interface HfLayoutMetrics {
  scale: number;
  fontScale: number;
  minFontSize: number;
  maxFontSize: number;
  padX: number;
  padY: number;
  gap: number;
  borderRadius: number;
  shellRadius: number;
  maxWidthPct: number;
  sideInsetPct: number;
}

export function hfLayoutMetrics(canvasWidth: number, canvasHeight: number): HfLayoutMetrics {
  const scale = hfScaleFactor(canvasWidth, canvasHeight);
  return {
    scale,
    fontScale: 0.9,
    minFontSize: Math.max(16, Math.round(20 * scale)),
    maxFontSize: Math.max(32, Math.round(96 * scale)),
    padX: Math.max(6, Math.round(12 * scale)),
    padY: Math.max(4, Math.round(8 * scale)),
    gap: Math.max(4, Math.round(8 * scale)),
    borderRadius: Math.max(6, Math.round(10 * scale)),
    shellRadius: Math.max(12, Math.round(22 * scale)),
    maxWidthPct: canvasWidth < 900 ? 96 : 92,
    sideInsetPct: canvasWidth < 900 ? 4 : 5,
  };
}

export function scaleHfPx(
  basePx: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  return Math.round(basePx * hfScaleFactor(canvasWidth, canvasHeight));
}

export function scaleHfCaptionFontSize(
  fontSizePx: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const metrics = hfLayoutMetrics(canvasWidth, canvasHeight);
  const scaled = Math.round(fontSizePx * metrics.fontScale * metrics.scale);
  return Math.max(metrics.minFontSize, Math.min(metrics.maxFontSize, scaled));
}

export interface HfOverlayMetrics {
  scale: number;
  leakBlurPx: number;
  leakBandWidthPct: number;
  motionBlurPx: (intensity: number) => number;
}

export function hfOverlayMetrics(canvasWidth: number, canvasHeight: number): HfOverlayMetrics {
  const scale = hfScaleFactor(canvasWidth, canvasHeight);
  return {
    scale,
    leakBlurPx: Math.max(18, Math.round(42 * scale)),
    leakBandWidthPct: canvasWidth < 900 ? 78 : 70,
    motionBlurPx: (intensity: number) => {
      const clamped = Math.max(0.15, Math.min(0.65, intensity));
      return Math.max(3, Math.round((4 + clamped * 18) * scale));
    },
  };
}