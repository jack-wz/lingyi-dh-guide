import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EditorObject } from '@shared/types/editor';
import type { LibraryItem } from '../../../types/library';
import AssetLibrary from '../../../components/AssetLibrary';
import LibraryQuickList from '../../../components/LibraryQuickList';
import { IconGrid, IconImage, IconType, IconUpload } from '../../../components/Icons';
import { usePageVisibleRefresh } from '../../../hooks/usePageVisibleRefresh';
import { assetHubHref, fetchLibraryItems } from '../../../utils/libraryApi';
import type { ToolKey } from '../types';

export default function ToolPopover({
  editorId,
  tool,
  addObject,
  onEdited,
  onApplyScript,
  onApplyVoice,
}: {
  editorId: string;
  tool: ToolKey;
  addObject: (type: EditorObject['type'], patch?: Partial<EditorObject>) => void;
  onEdited?: () => void;
  onApplyScript: (item: LibraryItem) => void;
  onApplyVoice: (item: LibraryItem) => void;
}) {
  const [mediaTab, setMediaTab] = useState<'scene' | 'sound' | 'sticker'>('scene');
  const [textTab, setTextTab] = useState<'script' | 'design' | 'subtitle'>('script');
  const refreshTick = usePageVisibleRefresh();
  const [scripts, setScripts] = useState<LibraryItem[]>([]);
  const [voices, setVoices] = useState<LibraryItem[]>([]);
  const [loadingLib, setLoadingLib] = useState(false);

  useEffect(() => {
    if (tool !== 'text') return;
    const controller = new AbortController();
    setLoadingLib(true);
    fetchLibraryItems({ category: 'script', limit: 40, signal: controller.signal })
      .then((items) => setScripts(items))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setScripts([]);
      })
      .finally(() => setLoadingLib(false));
    return () => controller.abort();
  }, [tool, refreshTick]);

  const hubTab = tool === 'text'
    ? 'script'
    : mediaTab === 'sound'
      ? 'voice'
      : 'media';
  const hubHref = assetHubHref(editorId, hubTab);

  return (
    <div className="absolute left-0 top-full mt-1 z-50 w-[340px] rounded-lg border border-border bg-card shadow-2xl p-3 flex flex-col max-h-[min(480px,70vh)]">
      {tool === 'text' && (
        <div className="space-y-2 flex flex-col min-h-0 overflow-hidden" style={{ maxHeight: 420 }}>
          <div className="flex gap-1 shrink-0">
            {([
              { id: 'script' as const, label: '脚本' },
              { id: 'design' as const, label: '文字' },
              { id: 'subtitle' as const, label: '字幕' },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTextTab(tab.id)}
                className={`flex-1 h-7 rounded-md text-[11px] ${textTab === tab.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {textTab === 'script' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <LibraryQuickList
                loading={loadingLib}
                emptyHint="暂无脚本"
                hubHref={assetHubHref(editorId, 'script')}
                items={scripts}
                renderIcon={() => <IconType size={14} className="text-muted-foreground" />}
                renderPreview={(item) => String(item.payload?.content || '').slice(0, 60)}
                onPick={(item) => { onApplyScript(item); onEdited?.(); }}
                pickLabel="填入"
                maxItems={10}
              />
            </div>
          )}
          {textTab === 'design' && (
            <div className="overflow-y-auto max-h-[320px] space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '标题 1', text: '标题 1', scale: 140, y: 24 },
                  { label: '标题 2', text: '标题 2', scale: 120, y: 32 },
                  { label: '副标题', text: '副标题文本', scale: 100, y: 70 },
                  { label: '正文', text: '正文内容', scale: 90, y: 50 },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => addObject('text', { label: item.label, text: item.text, scale: item.scale, position: { x: 50, y: item.y } })}
                    className="h-14 rounded-md border border-border hover:border-foreground/40 hover:bg-accent text-left px-2.5"
                  >
                    <div className="text-xs font-medium">{item.label}</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: '线条', shape: 'Line' },
                  { label: '箭头', shape: 'Arrow' },
                  { label: '矩形', shape: 'Square' },
                  { label: '圆形', shape: 'Circle' },
                  { label: '三角', shape: 'Triangle' },
                  { label: '星形', shape: 'Star' },
                  { label: '边框', shape: 'Frame' },
                  { label: '标签', shape: 'Label' },
                ].map((item) => (
                  <button
                    key={item.shape}
                    type="button"
                    onClick={() => addObject('sticker', { label: item.label, text: item.label, scale: 90, metadata: { source: 'shape', shape_type: item.shape } })}
                    className="h-11 rounded-md border border-border hover:border-foreground/40 hover:bg-accent flex flex-col items-center justify-center text-[10px]"
                  >
                    <IconGrid size={14} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {textTab === 'subtitle' && (
            <div className="flex-1 min-h-0 -mx-1 overflow-y-auto">
              <AssetLibrary tab="subtitle" editorId={editorId} onEdited={onEdited} showSearch={false} />
            </div>
          )}
        </div>
      )}

      {tool === 'media' && (
        <div className="space-y-2 flex flex-col min-h-0 overflow-hidden" style={{ maxHeight: 420 }}>
          <div className="flex items-center gap-1 shrink-0">
            {([
              { id: 'scene' as const, label: '场景' },
              { id: 'sound' as const, label: '声音' },
              { id: 'sticker' as const, label: '贴纸' },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMediaTab(tab.id)}
                className={`flex-1 h-7 rounded-md text-[11px] ${mediaTab === tab.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 -mx-1 overflow-y-auto">
            <AssetLibrary tab={mediaTab} editorId={editorId} onEdited={onEdited} showSearch={mediaTab !== 'sticker'} />
          </div>
          {mediaTab === 'scene' && (
            <div className="grid grid-cols-2 gap-1.5 shrink-0 pt-1 border-t border-border">
              <button
                type="button"
                onClick={() => addObject('image', { label: '媒体素材', scale: 100, metadata: { source: 'media' } })}
                className="h-8 rounded-md border border-border hover:bg-accent text-[11px] flex items-center justify-center gap-1"
              >
                <IconImage size={13} /> 空图层
              </button>
              <button
                type="button"
                onClick={() => addObject('logo', { label: 'Logo', scale: 80, position: { x: 12, y: 10 }, metadata: { source: 'media' } })}
                className="h-8 rounded-md border border-border hover:bg-accent text-[11px] flex items-center justify-center gap-1"
              >
                <IconUpload size={13} /> Logo
              </button>
            </div>
          )}
          {mediaTab === 'sticker' && (
            <div className="shrink-0 pt-1 border-t border-border max-h-24 overflow-y-auto -mx-1">
              <AssetLibrary tab="anim" editorId={editorId} onEdited={onEdited} showSearch={false} />
            </div>
          )}
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-border shrink-0 flex justify-end">
        <Link to={hubHref} className="text-[10px] text-brand-blue hover:underline">
          在资产库管理 →
        </Link>
      </div>
    </div>
  );
}
