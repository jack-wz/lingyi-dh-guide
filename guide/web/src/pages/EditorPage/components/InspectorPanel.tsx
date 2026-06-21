import type { CSSProperties } from 'react';
import type { CanvasElement, DSL } from '@shared/types/editor';
import type { LibraryItem } from '../../../types/library';
import type { PickerCategory } from '../../../components/AssetPickerModal';
import LayersPanel from '../../../components/LayersPanel';
import { IconLayers, IconZap } from '../../../components/Icons';
import type { InspectorTab } from '../types';
import DesignPanel from './panels/DesignPanel';
import MotionPanel from './panels/MotionPanel';
import ObjectPanel from './panels/ObjectPanel';
import SceneQuickPanel from './panels/SceneQuickPanel';

export type { InspectorTab };

export default function InspectorPanel({
  tab,
  setTab,
  dsl,
  editorId,
  currentSegIndex,
  selectedElement,
  updateDsl,
  onInsertFrameShot,
  onOpenAssetPicker,
  onApplyBgm,
  style,
}: {
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  dsl: DSL;
  editorId: string;
  currentSegIndex: number;
  selectedElement: CanvasElement;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
  onInsertFrameShot: (frameId: string) => void;
  onOpenAssetPicker: (category: PickerCategory, voiceSubType?: 'tts' | 'bgm') => void;
  onApplyBgm: (item: LibraryItem) => void;
  style?: CSSProperties;
}) {
  const hasObjectSelection = selectedElement.type === 'object' || selectedElement.type === 'digital_human' || selectedElement.type === 'subtitle' || selectedElement.type === 'overlay';
  return (
    <aside className="bg-card border-l border-border shrink-0 flex flex-col min-h-0" style={style}>
      <div className="h-11 border-b border-border flex shrink-0">
        <button
          onClick={() => setTab('design')}
          className={`flex-1 text-xs font-medium ${tab === 'design' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          设计
        </button>
        <button
          onClick={() => setTab('motion')}
          className={`flex-1 text-xs font-medium flex items-center justify-center gap-0.5 ${tab === 'motion' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          data-testid="inspector-tab-motion"
        >
          <IconZap size={12} />
          动效
        </button>
        <button
          onClick={() => setTab('layers')}
          className={`flex-1 text-xs font-medium flex items-center justify-center gap-0.5 ${tab === 'layers' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <IconLayers size={12} />
          图层
        </button>
        <button
          onClick={() => setTab('object')}
          className={`flex-1 text-xs font-medium ${tab === 'object' ? 'text-foreground border-b-2 border-foreground' : hasObjectSelection ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50'}`}
        >
          对象
        </button>
      </div>
      {tab === 'layers' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <SceneQuickPanel
            dsl={dsl}
            editorId={editorId}
            currentSegIndex={currentSegIndex}
            updateDsl={updateDsl}
            onPickMedia={() => onOpenAssetPicker('media')}
          />
          <div className="flex-1 min-h-0 overflow-hidden border-t border-border">
            <LayersPanel
              dsl={dsl}
              currentSegIndex={currentSegIndex}
              selectedElement={selectedElement}
              updateDsl={updateDsl}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'design' ? (
            <DesignPanel
              dsl={dsl}
              editorId={editorId}
              currentSegIndex={currentSegIndex}
              updateDsl={updateDsl}
              onInsertFrameShot={onInsertFrameShot}
              onPickBgm={() => onOpenAssetPicker('voice', 'bgm')}
              onApplyBgm={onApplyBgm}
            />
          ) : tab === 'motion' ? (
            <MotionPanel
              dsl={dsl}
              editorId={editorId}
              currentSegIndex={currentSegIndex}
              updateDsl={updateDsl}
            />
          ) : (
            <ObjectPanel dsl={dsl} currentSegIndex={currentSegIndex} selectedElement={selectedElement} updateDsl={updateDsl} />
          )}
        </div>
      )}
    </aside>
  );
}