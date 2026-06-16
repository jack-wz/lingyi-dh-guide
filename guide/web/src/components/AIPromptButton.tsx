import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { enhanceSceneDescription, getCameraMovements, getSceneMoods } from '../utils/promptEnhance';
import { IconSparkles, IconSettings2 } from './Icons';

export default function AIPromptButton() {
  const dsl = useEditorStore(s => s.dsl);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const updateDsl = useEditorStore(s => s.updateDsl);
  const [showPanel, setShowPanel] = useState(false);
  const [camera, setCamera] = useState('');
  const [mood, setMood] = useState('');

  if (!dsl) return null;
  const seg = dsl.segments[currentSegIndex];
  if (!seg) return null;

  const handleEnhance = () => {
    const enhanced = enhanceSceneDescription(seg.scene_description, dsl.meta.type, camera || seg.camera_shot);
    updateDsl(d => {
      const segs = [...d.segments];
      segs[currentSegIndex] = { ...segs[currentSegIndex], scene_description: enhanced };
      return { ...d, segments: segs };
    });
    setShowPanel(false);
  };

  const handleQuickEnhance = () => {
    if (!seg.scene_description.trim()) return;
    const enhanced = enhanceSceneDescription(seg.scene_description, dsl.meta.type, seg.camera_shot);
    updateDsl(d => {
      const segs = [...d.segments];
      segs[currentSegIndex] = { ...segs[currentSegIndex], scene_description: enhanced };
      return { ...d, segments: segs };
    });
  };

  return (
    <div className="relative">
      <div className="flex gap-1">
        <button onClick={handleQuickEnhance}
          disabled={!seg.scene_description.trim()}
          className="flex-1 px-2 py-1.5 text-[10px] bg-gradient-to-r from-violet-600/80 to-blue-600/80 text-white rounded-lg hover:from-violet-500 hover:to-blue-500 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1">
          <IconSparkles size={12} /> AI 优化描述
        </button>
        <button onClick={() => setShowPanel(!showPanel)}
          className="px-2 py-1.5 text-[10px] bg-secondary text-secondary-foreground rounded-md hover:bg-accent transition-colors">
          <IconSettings2 size={12} />
        </button>
      </div>

      {showPanel && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg p-3 z-50 shadow-xl">
          <h4 className="text-[10px] text-muted-foreground mb-2">AI 场景增强设置</h4>

          <div className="mb-2">
            <label className="text-[9px] text-muted-foreground block mb-1">镜头运动</label>
            <div className="flex flex-wrap gap-1">
              {getCameraMovements().slice(0, 6).map(cm => (
                <button key={cm.label}
                  onClick={() => setCamera(camera === cm.label ? '' : cm.label)}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition ${
                    camera === cm.label ? 'border-brand-blue bg-brand-blue/15 text-brand-blue' : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}>{cm.label}</button>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <label className="text-[9px] text-muted-foreground block mb-1">画面氛围</label>
            <div className="flex flex-wrap gap-1">
              {getSceneMoods().map(m => (
                <button key={m.label}
                  onClick={() => setMood(mood === m.label ? '' : m.label)}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition ${
                    mood === m.label ? 'border-brand-purple bg-brand-purple/15 text-brand-purple' : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}>{m.label}</button>
              ))}
            </div>
          </div>

          <button onClick={handleEnhance}
            className="w-full py-1.5 text-[10px] bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-md hover:from-violet-500 hover:to-blue-500 transition-colors flex items-center justify-center gap-1">
            <IconSparkles size={12} /> 生成增强描述
          </button>
        </div>
      )}
    </div>
  );
}
