import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DSL, Segment } from '../store/editorStore';
import ScriptPanel from './ScriptPanel';
import TimelinePanel from './TimelinePanel';

type BottomMode = 'script' | 'timeline';

interface Props {
  dsl: DSL;
  currentSegIndex: number;
  variableValues: Record<string, string>;
  editorId?: string;
  columnRef?: RefObject<HTMLElement | null>;
  onSelectScene: (index: number) => void;
  onUpdateSegment: (index: number, patch: Partial<Segment>) => void;
  onPickScript?: () => void;
}

const MODE_BUTTONS: Array<{ id: BottomMode; label: string }> = [
  { id: 'script', label: '镜头脚本' },
  { id: 'timeline', label: '精调（时间轴）' },
];

const MODE_HINT: Record<BottomMode, string> = {
  script: '编辑各镜头口播与时长',
  timeline: '精调模式：点击分镜块切换 · 拖动元素层调整出现时间',
};

const STORAGE_KEY = 'guide.editor.bottomPanelHeight';
const DEFAULT_HEIGHT = 300;
const MIN_PANEL_HEIGHT = 120;
const MIN_CANVAS_HEIGHT = 140;

function readStoredHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_HEIGHT;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= MIN_PANEL_HEIGHT ? parsed : DEFAULT_HEIGHT;
}

function clampPanelHeight(requested: number, columnHeight: number): number {
  const maxPanel = Math.max(MIN_PANEL_HEIGHT, columnHeight - MIN_CANVAS_HEIGHT);
  return Math.max(MIN_PANEL_HEIGHT, Math.min(maxPanel, requested));
}

export default function EditorBottomPanel({
  dsl,
  currentSegIndex,
  variableValues,
  editorId,
  columnRef,
  onSelectScene,
  onUpdateSegment,
  onPickScript,
}: Props) {
  const [mode, setMode] = useState<BottomMode>('script');
  const [panelHeight, setPanelHeight] = useState(readStoredHeight);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, pointerId: -1 });

  const resolveColumnHeight = useCallback(() => {
    const column = columnRef?.current;
    if (column) return column.getBoundingClientRect().height;
    return Math.max(480, window.innerHeight * 0.55);
  }, [columnRef]);

  const applyHeightFromPointer = useCallback((clientY: number) => {
    const column = columnRef?.current;
    const columnRect = column?.getBoundingClientRect();
    const columnBottom = columnRect?.bottom ?? window.innerHeight;
    const columnHeight = columnRect?.height ?? resolveColumnHeight();
    const next = columnBottom - clientY;
    setPanelHeight(clampPanelHeight(next, columnHeight));
  }, [columnRef, resolveColumnHeight]);

  useEffect(() => {
    const column = columnRef?.current;
    if (!column) return undefined;
    const sync = () => {
      setPanelHeight((current) => clampPanelHeight(current, column.getBoundingClientRect().height));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(column);
    return () => observer.disconnect();
  }, [columnRef]);

  useEffect(() => {
    if (!isDragging) return undefined;
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;
      applyHeightFromPointer(e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;
      dragRef.current.active = false;
      setIsDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isDragging, applyHeightFromPointer]);

  useEffect(() => {
    if (isDragging) return;
    window.localStorage.setItem(STORAGE_KEY, String(Math.round(panelHeight)));
  }, [panelHeight, isDragging]);

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { active: true, pointerId: e.pointerId };
    setIsDragging(true);
    applyHeightFromPointer(e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== dragRef.current.pointerId) return;
    dragRef.current.active = false;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleResizeDoubleClick = () => {
    const columnHeight = resolveColumnHeight();
    setPanelHeight(clampPanelHeight(DEFAULT_HEIGHT, columnHeight));
  };

  return (
    <>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(panelHeight)}
        onPointerDown={handleResizePointerDown}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        onDoubleClick={handleResizeDoubleClick}
        className={`flex h-3 shrink-0 cursor-row-resize touch-none select-none items-center justify-center border-t border-border transition-colors ${
          isDragging ? 'bg-primary/20' : 'bg-secondary/80 hover:bg-accent'
        }`}
        title="拖动调整面板高度（双击恢复默认）"
        data-testid="editor-bottom-resize-handle"
      >
        <div className={`h-1 w-10 rounded-full transition-colors ${isDragging ? 'bg-primary' : 'bg-muted-foreground/35'}`} />
      </div>
      <div
        data-bottom-panel
        className="flex shrink-0 flex-col border-t border-border bg-card overflow-hidden"
        style={{ height: panelHeight }}
      >
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 shrink-0 h-9">
          {MODE_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              type="button"
              data-testid={`editor-bottom-tab-${btn.id}`}
              onClick={() => setMode(btn.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                mode === btn.id
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {btn.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground hidden sm:inline">
            {MODE_HINT[mode]}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {mode === 'script' ? (
            <ScriptPanel
              dsl={dsl}
              currentSegIndex={currentSegIndex}
              variableValues={variableValues}
              editorId={editorId}
              onSelectScene={onSelectScene}
              onUpdateSegment={onUpdateSegment}
              onPickScript={onPickScript}
            />
          ) : (
            <TimelinePanel />
          )}
        </div>
      </div>
    </>
  );
}