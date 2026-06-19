import { Link } from 'react-router-dom';
import type { DSL, Segment } from '@shared/types/editor';
import AIPromptButton from '../../../../components/AIPromptButton';
import FileUploader from '../../../../components/FileUploader';
import { getSegmentIssues } from '../../../../utils/segmentIssues';
import { normalizeSegmentObjects } from '../../../../utils/elementTiming';

export default function SceneQuickPanel({
  dsl,
  editorId,
  currentSegIndex,
  updateDsl,
  onPickMedia,
}: {
  dsl: DSL;
  editorId: string;
  currentSegIndex: number;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
  onPickMedia: () => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const issues = getSegmentIssues(seg);
  const updateSeg = (partial: Partial<Segment>) => {
    updateDsl((draft) => {
      const segments = [...draft.segments];
      segments[currentSegIndex] = { ...segments[currentSegIndex], ...partial };
      return { ...draft, segments };
    });
  };

  return (
    <div className="shrink-0 p-3 space-y-2 border-b border-border bg-secondary/20 max-h-[42%] overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold">场景 {currentSegIndex + 1}</h3>
          <p className="text-[10px] text-muted-foreground">
            {issues.length > 0 ? `${issues.length} 项待完善` : '可用于生成'}
          </p>
        </div>
        <label className="text-[10px] text-muted-foreground shrink-0">
          时长
          <input
            type="number"
            min={1}
            max={60}
            value={Number(seg.duration_sec || 5)}
            onChange={(e) => updateSeg(normalizeSegmentObjects({ ...seg, duration_sec: Number(e.target.value) }))}
            className="mt-0.5 block w-14 h-8 rounded-md border border-border bg-background px-2 text-[12px] text-center"
          />
        </label>
      </div>
      <select
        value={seg.layout || 'avatar-center'}
        onChange={(e) => updateSeg({ layout: e.target.value as Segment['layout'] })}
        className="w-full h-8 rounded-md border border-border bg-background px-2 text-[12px]"
        aria-label="场景布局"
      >
        <option value="avatar-left">数字人靠左</option>
        <option value="avatar-center">数字人居中</option>
        <option value="avatar-right">数字人靠右</option>
        <option value="media-grid">媒体网格</option>
        <option value="full-media">全屏媒体</option>
      </select>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onPickMedia}
          className="flex-1 h-8 rounded-md border border-border bg-background hover:bg-accent text-[11px] text-brand-blue"
        >
          从资产库选背景
        </button>
        <Link
          to={`/assets?tab=media&from=${encodeURIComponent(`/editor/${editorId}`)}`}
          className="h-8 px-2 rounded-md border border-border text-[10px] text-muted-foreground hover:bg-accent flex items-center"
        >
          管理
        </Link>
      </div>
      <FileUploader
        value={seg.scene_image_url}
        onChange={(url) => updateSeg({ scene_image_url: url, thumbnail_url: url })}
        accept="image/*,video/*"
        placeholder="或粘贴背景图 URL"
        previewType="image"
      />
      <label className="block text-[10px] text-muted-foreground">场景描述（供 AI 场景图生成）</label>
      <textarea
        value={seg.scene_description || ''}
        onChange={(e) => updateSeg({ scene_description: e.target.value })}
        placeholder="描述画面、镜头与氛围"
        className="w-full h-16 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
      />
      <AIPromptButton />
    </div>
  );
}
