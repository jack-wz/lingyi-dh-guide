import { useCallback, useState } from 'react';
import type { DSL, Segment } from '../store/editorStore';
import ScriptPanel from './ScriptPanel';
import TimelinePanel from './TimelinePanel';

type BottomMode = 'script' | 'timeline';

interface Props {
  dsl: DSL;
  currentSegIndex: number;
  variableValues: Record<string, string>;
  editorId?: string;
  onSelectScene: (index: number) => void;
  onUpdateSegment: (index: number, patch: Partial<Segment>) => void;
  onPickScript?: () => void;
}

const MODE_BUTTONS: Array<{ id: BottomMode; label: string }> = [
  { id: 'script', label: '场景脚本' },
  { id: 'timeline', label: '时间轴' },
];

const MODE_HINT: Record<BottomMode, string> = {
  script: '编辑各分镜口播与时长',
  timeline: '点击分镜块切换 · 拖动元素层调整出现时间',
};

export default function EditorBottomPanel({
  dsl,
  currentSegIndex,
  variableValues,
  editorId,
  onSelectScene,
  onUpdateSegment,
  onPickScript,
}: Props) {
  const [mode, setMode] = useState<BottomMode>('script');
  const [panelHeight, setPanelHeight] = useState(200);
  const [isDragging, setIsDragging] = useState(false);

  const handleOuterMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const next = window.innerHeight - e.clientY;
    setPanelHeight(Math.max(140, Math.min(360, next)));
  }, [isDragging]);

  return (
    <>
      <div
        onMouseDown={() => setIsDragging(true)}
        className="flex h-2 shrink-0 cursor-row-resize items-center justify-center bg-secondary/80 hover:bg-accent border-t border-border"
        title="拖动调整面板高度"
      >
        <div className="h-1 w-8 rounded-full bg-muted-foreground/30" />
      </div>
      <div
        data-bottom-panel
        className="flex shrink-0 flex-col border-t border-border bg-card overflow-hidden"
        style={{ height: panelHeight }}
        onMouseMove={handleOuterMouseMove}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
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