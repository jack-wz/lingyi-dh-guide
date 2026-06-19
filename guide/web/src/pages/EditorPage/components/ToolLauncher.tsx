import { useEffect, useRef, type ReactNode } from 'react';
import type { EditorObject } from '@shared/types/editor';
import type { LibraryItem } from '../../../types/library';
import { IconImage, IconType } from '../../../components/Icons';
import ToolPopover from './ToolPopover';
import type { ToolKey } from '../types';

export type { ToolKey };

export default function ToolLauncher({
  editorId,
  activeTool,
  setActiveTool,
  addObject,
  onEdited,
  onApplyScript,
  onApplyVoice,
}: {
  editorId: string;
  activeTool: ToolKey | null;
  setActiveTool: (tool: ToolKey | null) => void;
  addObject: (type: EditorObject['type'], patch?: Partial<EditorObject>) => void;
  onEdited?: () => void;
  onApplyScript: (item: LibraryItem) => void;
  onApplyVoice: (item: LibraryItem) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tools: Array<{ key: ToolKey; label: string; icon: ReactNode }> = [
    { key: 'text', label: '文字', icon: <IconType size={17} /> },
    { key: 'media', label: '素材', icon: <IconImage size={17} /> },
  ];

  useEffect(() => {
    if (!activeTool || activeTool === 'generate') return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setActiveTool(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveTool(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTool, setActiveTool]);

  return (
    <div ref={wrapperRef} className="relative z-50 flex items-center gap-0.5 border-l border-border pl-1.5 ml-1 shrink-0">
      {tools.map((tool) => {
        const pressed = activeTool === tool.key;
        return (
          <button
            key={tool.key}
            type="button"
            aria-label={tool.label}
            title={tool.label}
            data-tool={tool.key}
            onClick={() => setActiveTool(activeTool === tool.key ? null : tool.key)}
            className={`relative w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors ${
              pressed ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {tool.icon}
          </button>
        );
      })}
      {activeTool && activeTool !== 'generate' && (
        <ToolPopover
          editorId={editorId}
          tool={activeTool}
          addObject={addObject}
          onEdited={onEdited}
          onApplyScript={onApplyScript}
          onApplyVoice={onApplyVoice}
        />
      )}
    </div>
  );
}
