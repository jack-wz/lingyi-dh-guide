import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../../store/editorStore';

export function usePreviewLayout() {
  const dsl = useEditorStore((s) => s.dsl);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  const canvasWidth = dsl?.globalConfig.canvas_width || 1080;
  const canvasHeight = dsl?.globalConfig.canvas_height || 1920;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const maxH = Math.max(0, rect.height - 24);
      const maxW = Math.max(0, rect.width - 24);
      if (maxH < 1 || maxW < 1) return;
      const s = Math.min(maxW / canvasWidth, maxH / canvasHeight);
      setScale(Number.isFinite(s) && s > 0 ? s : 0.2);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasWidth, canvasHeight]);

  return {
    containerRef,
    canvasWidth,
    canvasHeight,
    scale,
    displayW: canvasWidth * scale,
    displayH: canvasHeight * scale,
  };
}