import type { CSSProperties } from 'react';
import type { Segment } from '../store/editorStore';
import { getSegmentIssues } from '../utils/segmentIssues';
import {
  IconAlertCircle,
  IconArrowRight,
  IconCopy,
  IconImage,
  IconPlus,
  IconTrash,
} from './Icons';

export default function EditorLeftPanel({
  dsl: _dsl,
  currentSegIndex,
  segmentItems,
  totalCount,
  onSelectSegment,
  onAddSegment,
  onDuplicateSegment,
  onDeleteSegment,
  onMoveUp,
  onMoveDown,
  onReorder,
  style,
}: {
  editorId?: string;
  dsl: { segments: Segment[] };
  currentSegIndex: number;
  segmentItems: Array<{ seg: Segment; index: number }>;
  totalCount: number;
  onSelectSegment: (index: number) => void;
  onAddSegment: () => void;
  onDuplicateSegment: (index: number) => void;
  onDeleteSegment: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  style?: CSSProperties;
}) {
  return (
    <aside className="bg-card border-r border-border flex flex-col shrink-0 min-h-0" style={style}>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <p className="text-xs font-medium text-foreground">分镜</p>
        <p className="text-[10px] text-muted-foreground">{totalCount} 个场景</p>
        <button
          type="button"
          onClick={onAddSegment}
          className="h-7 px-2 rounded-md flex items-center gap-1 bg-secondary text-secondary-foreground hover:bg-accent text-[10px] font-medium"
        >
          <IconPlus size={12} />
          添加
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {segmentItems.map(({ seg, index }) => {
          const active = index === currentSegIndex;
          const issues = getSegmentIssues(seg);
          return (
            <div
              key={seg.id}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(index));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromIndex = Number(e.dataTransfer.getData('text/plain'));
                if (Number.isFinite(fromIndex)) onReorder(fromIndex, index);
              }}
              onClick={() => onSelectSegment(index)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelectSegment(index); }}
              className={`w-full text-left rounded-md border p-2 transition-colors ${
                active ? 'border-foreground bg-accent' : 'border-border hover:border-foreground/30 hover:bg-accent/40'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="w-10 h-14 rounded bg-secondary border border-border overflow-hidden flex items-center justify-center shrink-0">
                  {seg.scene_image_url ? (
                    <img src={seg.scene_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <IconImage size={16} className="text-muted-foreground/50" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-medium">场景 {index + 1}</span>
                    <span className="text-[9px] text-muted-foreground">{seg.duration_sec}s</span>
                    {issues.length > 0 && (
                      <span className="ml-auto w-4 h-4 rounded-full bg-brand-amber/15 text-brand-amber flex items-center justify-center" title={issues.join('、')}>
                        <IconAlertCircle size={11} />
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">
                    {seg.narration_text || seg.scene_description || '未填写内容'}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-1">
                <button type="button" onClick={(e) => { e.stopPropagation(); onMoveUp(index); }} className={`w-6 h-6 rounded flex items-center justify-center ${index === 0 ? 'text-muted-foreground/30' : 'text-muted-foreground hover:text-foreground hover:bg-background'}`} title="上移">
                  <IconArrowRight size={12} className="-rotate-90" />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onMoveDown(index); }} className={`w-6 h-6 rounded flex items-center justify-center ${index >= totalCount - 1 ? 'text-muted-foreground/30' : 'text-muted-foreground hover:text-foreground hover:bg-background'}`} title="下移">
                  <IconArrowRight size={12} className="rotate-90" />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicateSegment(index); }} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background" title="复制">
                  <IconCopy size={13} />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteSegment(index); }} className={`w-6 h-6 rounded flex items-center justify-center ${totalCount <= 1 ? 'text-muted-foreground/30' : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'}`} title="删除">
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}