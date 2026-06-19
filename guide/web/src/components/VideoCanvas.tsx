import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getSegmentLocalTime } from '../utils/overlayTiming';
import { duplicateCanvasSelection, removeCanvasSelection } from '../utils/canvasSelectionActions';
import { buildEditorPreviewHtml } from '../utils/buildPreviewHtml';
import {
  hasHyperframesRuntime,
  isHyperframesReady,
  seekHyperframesIframe,
  setHyperframesPlayback,
  waitForHyperframesPlayer,
} from '../utils/hyperframesBridge';
import PreviewInteractionLayer from './PreviewInteractionLayer';
import { usePreviewLayout } from './VideoCanvas/hooks/usePreviewLayout';
import { useSegmentPreviewAudio } from '../hooks/useSegmentPreviewAudio';

export default function VideoCanvas() {
  const dsl = useEditorStore(s => s.dsl);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const currentTime = useEditorStore(s => s.currentTime);
  const playing = useEditorStore(s => s.playing);
  const mutedTracks = useEditorStore(s => s.mutedTracks);
  const previewVariables = useEditorStore(s => s.previewVariables);
  const getSegmentStartTime = useEditorStore(s => s.getSegmentStartTime);
  const selectedElement = useEditorStore(s => s.selectedElement);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const updateDsl = useEditorStore(s => s.updateDsl);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const suppressPreviewRebuildRef = useRef(false);
  const htmlGenerationRef = useRef(0);
  const [hfReady, setHfReady] = useState(false);
  const [hfRuntimeFailed, setHfRuntimeFailed] = useState(false);
  const [previewBuildError, setPreviewBuildError] = useState<string | null>(null);
  const [html, setHtml] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layout = usePreviewLayout();
  const dslKey = useMemo(() => JSON.stringify(dsl), [dsl]);
  const previewVarsKey = useMemo(() => JSON.stringify(previewVariables), [previewVariables]);
  const dslRef = useRef(dsl);
  const previewVariablesRef = useRef(previewVariables);
  dslRef.current = dsl;
  previewVariablesRef.current = previewVariables;

  const [previewGeneration, setPreviewGeneration] = useState(0);
  const [canvasMode, setCanvasMode] = useState<'edit' | 'preview'>('edit');
  const isPreviewMode = canvasMode === 'preview';

  const segment = dsl?.segments[currentSegIndex];
  const segmentStart = getSegmentStartTime(currentSegIndex);
  const localTime = getSegmentLocalTime(currentTime, segmentStart);
  const previewAudioUrl = segment?.subtitle?.hf_params?.preview_audio_url;

  useSegmentPreviewAudio({
    previewUrl: previewAudioUrl,
    localTime,
    playing: isPreviewMode && playing,
    muted: mutedTracks.has('audio'),
  });

  const markPreviewReady = useCallback(() => {
    const iframe = iframeRef.current;
    setHfReady(true);
    setHfRuntimeFailed(!hasHyperframesRuntime(iframe));
    setHyperframesPlayback(iframe, false);
    seekHyperframesIframe(iframe, currentTime);
  }, [currentTime]);

  useEffect(() => {
    if (playing && canvasMode === 'edit') setCanvasMode('preview');
  }, [playing, canvasMode]);

  const rebuildPreview = useCallback(() => {
    if (!dsl) return;
    setPreviewBuildError(null);
    setHfReady(false);
    setHfRuntimeFailed(false);
    try {
      htmlGenerationRef.current += 1;
      setPreviewGeneration(htmlGenerationRef.current);
      setHtml(buildEditorPreviewHtml(dsl, previewVariables));
    } catch (error) {
      const msg = error instanceof Error ? error.message : '预览 HTML 生成失败';
      console.error('[VideoCanvas] Failed to build preview HTML', error);
      setPreviewBuildError(msg);
      setHfReady(true);
      setHfRuntimeFailed(true);
    }
  }, [dsl, previewVariables]);

  type PreviewUiState = 'building' | 'loading_runtime' | 'ready' | 'degraded' | 'failed';
  const previewUiState: PreviewUiState = useMemo(() => {
    if (previewBuildError) return 'failed';
    if (!html) return 'building';
    if (!hfReady) return 'loading_runtime';
    if (hfRuntimeFailed) return 'degraded';
    return 'ready';
  }, [previewBuildError, html, hfReady, hfRuntimeFailed]);

  useEffect(() => {
    if (!dsl) return;
    if (suppressPreviewRebuildRef.current) {
      suppressPreviewRebuildRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        htmlGenerationRef.current += 1;
        setPreviewGeneration(htmlGenerationRef.current);
        setPreviewBuildError(null);
        setHtml(buildEditorPreviewHtml(dslRef.current!, previewVariablesRef.current));
        setHfReady(false);
        setHfRuntimeFailed(false);
      } catch (error) {
        const msg = error instanceof Error ? error.message : '预览 HTML 生成失败';
        console.error('[VideoCanvas] Failed to build preview HTML', error);
        setPreviewBuildError(msg);
        setHfReady(true);
        setHfRuntimeFailed(true);
      }
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [dslKey, previewVarsKey]);

  const handleIframeLoad = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    await waitForHyperframesPlayer(iframe, 4000);
    markPreviewReady();
  }, [markPreviewReady]);

  useEffect(() => {
    if (!html) return;
    let cancelled = false;

    const tryMarkReady = () => {
      if (!cancelled) markPreviewReady();
    };

    const poll = async () => {
      for (let i = 0; i < 80 && !cancelled; i += 1) {
        if (isHyperframesReady(iframeRef.current)) {
          tryMarkReady();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      tryMarkReady();
    };

    void poll();
    const fallback = window.setTimeout(tryMarkReady, 2000);

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [html, previewGeneration, markPreviewReady]);

  useEffect(() => {
    if (!hfReady) return;
    const iframe = iframeRef.current;
    if (isPreviewMode && playing) {
      setHyperframesPlayback(iframe, true);
    } else {
      setHyperframesPlayback(iframe, false);
    }
    seekHyperframesIframe(iframe, currentTime);
  }, [currentTime, hfReady, playing, isPreviewMode]);

  const switchCanvasMode = (mode: 'edit' | 'preview', event?: MouseEvent) => {
    event?.stopPropagation();
    if (mode === 'edit' && playing) {
      useEditorStore.getState().setPlaying(false);
    }
    setCanvasMode(mode);
    if (mode === 'preview') {
      setSelectedElement({ type: 'none' });
    }
  };

  const hasCanvasSelection = selectedElement.type !== 'none' && selectedElement.segIndex === currentSegIndex;
  const selectionLabel =
    selectedElement.type === 'object'
      ? segment?.objects?.[selectedElement.objectIndex]?.label || '对象'
      : selectedElement.type === 'overlay'
        ? `贴片 ${selectedElement.overlayIndex + 1}`
        : selectedElement.type === 'digital_human'
          ? '数字人'
          : selectedElement.type === 'subtitle'
            ? '字幕'
            : '';

  const duplicateSelection = () => {
    if (!dsl || !segment) return;
    const result = duplicateCanvasSelection(dsl, currentSegIndex, selectedElement);
    if (!result) return;
    updateDsl(() => result.dsl);
    setSelectedElement(result.selection);
  };

  const removeSelection = () => {
    if (!dsl) return;
    const next = removeCanvasSelection(dsl, currentSegIndex, selectedElement);
    if (!next) return;
    updateDsl(() => next);
    setSelectedElement({ type: 'none' });
  };

  if (!dsl || !segment) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">无片段</div>;
  }

  return (
    <div ref={layout.containerRef} className="h-full min-h-0 w-full flex items-center justify-center bg-background p-3 overflow-hidden">
      <div
        className="relative shrink-0 rounded-xl shadow-2xl ring-1 ring-white/10 overflow-hidden bg-black max-h-full max-w-full"
        data-testid="video-canvas"
        style={{ width: layout.displayW, height: layout.displayH }}
      >
        {html ? (
          <iframe
            key={previewGeneration}
            ref={iframeRef}
            title="HyperFrames 实时预览"
            srcDoc={html}
            onLoad={() => { void handleIframeLoad(); }}
            sandbox="allow-scripts allow-same-origin"
            className="absolute top-0 left-0 border-0 origin-top-left pointer-events-none"
            style={{
              width: layout.canvasWidth,
              height: layout.canvasHeight,
              transform: `scale(${layout.scale})`,
            }}
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm pointer-events-none"
            data-testid="preview-state-building"
          >
            <span className="inline-block h-4 w-4 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin" />
            正在生成预览…
          </div>
        )}

        {previewUiState === 'loading_runtime' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white text-xs pointer-events-none"
            data-testid="preview-state-loading"
          >
            <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            加载 HyperFrames 运行时…
            <span className="text-[10px] text-white/70">API 正常时也可直接提交渲染验证成片</span>
          </div>
        )}

        {previewUiState === 'ready' && (
          <div
            className="absolute bottom-2 right-2 z-10 px-2 py-0.5 rounded bg-emerald-600/85 text-[10px] text-white pointer-events-none"
            data-testid="preview-state-ready"
          >
            预览就绪
          </div>
        )}

        {previewUiState === 'degraded' && (
          <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between gap-2 pointer-events-auto">
            <span
              className="px-2 py-0.5 rounded bg-amber-500/90 text-[10px] text-white"
              data-testid="preview-state-degraded"
            >
              静态预览（HyperFrames 运行时未加载）
            </span>
            <button
              type="button"
              onClick={rebuildPreview}
              className="px-2 py-0.5 rounded bg-white/90 text-[10px] text-black hover:bg-white"
            >
              重试预览
            </button>
          </div>
        )}

        {previewUiState === 'failed' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 text-white text-xs p-4 z-10"
            data-testid="preview-state-failed"
          >
            <p className="text-center max-w-[90%]">预览失败：{previewBuildError}</p>
            <p className="text-[10px] text-white/70 text-center max-w-[90%]">
              这不代表 API 或渲染流水线故障。可刷新页面，或先用 make smoke-integrator 验证成片。
            </p>
            <button
              type="button"
              onClick={rebuildPreview}
              className="px-3 py-1.5 rounded-md bg-white text-black text-[11px] hover:bg-white/90"
            >
              重试预览
            </button>
          </div>
        )}

        <PreviewInteractionLayer
          layout={layout}
          iframeRef={iframeRef}
          suppressPreviewRebuildRef={suppressPreviewRebuildRef}
          interactionEnabled={!isPreviewMode}
          showSubtitleOverlay={!hfReady || hfRuntimeFailed}
        />

        <div className="absolute top-2 right-2 z-20 flex rounded-md border border-white/20 bg-black/55 backdrop-blur-sm p-0.5 pointer-events-auto">
          <button
            type="button"
            data-testid="canvas-mode-edit"
            onClick={(e) => switchCanvasMode('edit', e)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              !isPreviewMode ? 'bg-white text-black' : 'text-white/80 hover:text-white'
            }`}
          >
            编辑
          </button>
          <button
            type="button"
            data-testid="canvas-mode-preview"
            onClick={(e) => switchCanvasMode('preview', e)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              isPreviewMode ? 'bg-white text-black' : 'text-white/80 hover:text-white'
            }`}
          >
            成片预览
          </button>
        </div>

        <div className="absolute top-2 left-2 flex gap-1.5 z-20 pointer-events-none">
          <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-white text-[10px]">
            {currentSegIndex + 1} / {dsl.segments.length}
          </span>
          <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-white text-[10px]">
            {segment.duration_sec}s
          </span>
          <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-white text-[10px] tabular-nums" data-testid="canvas-time">
            {localTime.toFixed(1)}s
          </span>
          <span className="px-2 py-0.5 bg-brand-blue/80 backdrop-blur-sm rounded text-white text-[10px]">
            {isPreviewMode ? '成片预览' : '编辑模式'}
          </span>
          {playing && (
            <span className="px-2 py-0.5 bg-emerald-600/85 backdrop-blur-sm rounded text-white text-[10px]">
              播放中
            </span>
          )}
        </div>

        {hasCanvasSelection && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-lg border border-border bg-card/95 shadow-xl backdrop-blur px-2 py-1 flex items-center gap-1">
            <span className="px-2 text-[11px] text-muted-foreground max-w-[120px] truncate">{selectionLabel}</span>
            {(selectedElement.type === 'object' || selectedElement.type === 'overlay') && (
              <button type="button" onClick={duplicateSelection} className="h-7 px-2 rounded-md text-[11px] bg-secondary hover:bg-accent">
                复制
              </button>
            )}
            <button
              type="button"
              onClick={removeSelection}
              className="h-7 px-2 rounded-md text-[11px] bg-destructive/10 text-destructive hover:bg-destructive/20"
            >
              {selectedElement.type === 'digital_human' || selectedElement.type === 'subtitle' ? '隐藏' : '删除'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}