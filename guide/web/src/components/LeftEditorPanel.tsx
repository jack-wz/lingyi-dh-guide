import { useState, type CSSProperties } from 'react';
import type { AssetTab } from '../store/editorStore';
import AssetLibrary from './AssetLibrary';
import { IconImage, IconLayers } from './Icons';

const ASSET_TABS: Array<{ id: AssetTab; label: string }> = [
  { id: 'scene', label: '场景' },
  { id: 'sticker', label: '贴纸' },
  { id: 'subtitle', label: '字幕' },
  { id: 'sound', label: '音效' },
  { id: 'anim', label: '动效' },
  { id: 'dh', label: '数字人' },
];

export default function LeftEditorPanel({
  sceneList,
  selectedDhId,
  onSelectDh,
  onEdited,
  style,
}: {
  sceneList: React.ReactNode;
  selectedDhId: string;
  onSelectDh?: (id: string) => void;
  onEdited?: () => void;
  style?: CSSProperties;
}) {
  const [panelTab, setPanelTab] = useState<'scenes' | 'assets'>('scenes');
  const [assetTab, setAssetTab] = useState<AssetTab>('scene');

  return (
    <aside className="bg-card border-r border-border flex flex-col shrink-0" style={style}>
      <div className="h-10 border-b border-border flex">
        <button
          onClick={() => setPanelTab('scenes')}
          className={`flex-1 text-[12px] font-medium flex items-center justify-center gap-1 ${panelTab === 'scenes' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <IconLayers size={14} />
          分镜
        </button>
        <button
          onClick={() => setPanelTab('assets')}
          className={`flex-1 text-[12px] font-medium flex items-center justify-center gap-1 ${panelTab === 'assets' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <IconImage size={14} />
          素材
        </button>
      </div>

      {panelTab === 'scenes' ? (
        sceneList
      ) : (
        <>
          <div className="flex flex-wrap gap-1 p-2 border-b border-border">
            {ASSET_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setAssetTab(tab.id)}
                className={`text-[10px] px-2 py-0.5 rounded-full ${assetTab === tab.id ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <AssetLibrary
              tab={assetTab}
              selectedDhId={selectedDhId}
              onSelectDh={onSelectDh}
              onEdited={onEdited}
              showSearch
            />
          </div>
        </>
      )}
    </aside>
  );
}

