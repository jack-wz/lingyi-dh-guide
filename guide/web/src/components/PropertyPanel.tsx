import { useRef } from 'react';
import { useEditorStore } from '../store/editorStore';

import FileUploader from './FileUploader';
import AIPromptButton from './AIPromptButton';
import { IconUser, IconType, IconFilm, IconMic, IconImage, IconLayers, IconSparkles } from './Icons';

const SUBTITLE_STYLES = [
  { value: 'default', label: '白字黑边' },
  { value: 'bottom-center', label: '底部居中' },
  { value: 'yellow-highlight', label: '醒目黄字' },
  { value: 'bold-white-stroke', label: '描边大字' },
  { value: 'subtitle-card', label: '半透明底栏' },
];

const TRANSITIONS = [
  { value: 'none', label: '无' },
  { value: 'fade', label: '淡入淡出' },
  { value: 'wipeleft', label: '左擦除' },
  { value: 'wiperight', label: '右擦除' },
  { value: 'circlecrop', label: '圆形裁剪' },
  { value: 'slideup', label: '上滑' },
  { value: 'zoomin', label: '缩放进入' },
];

const TYPES = [
  { value: 'narration', label: '口播', icon: IconMic },
  { value: 'product', label: '产品展示', icon: IconImage },
  { value: 'scene', label: '场景', icon: IconLayers },
  { value: 'transition', label: '转场', icon: IconSparkles },
  { value: 'ending', label: '结尾', icon: IconFilm },
];



export default function PropertyPanel() {
  const dsl = useEditorStore(s => s.dsl);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const selectedElement = useEditorStore(s => s.selectedElement);
  const updateDsl = useEditorStore(s => s.updateDsl);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!dsl) return null;
  const seg = dsl.segments[currentSegIndex];
  if (!seg) return null;

  const updateSeg = (partial: Record<string, any>) => {
    updateDsl(d => {
      const segs = [...d.segments];
      segs[currentSegIndex] = { ...segs[currentSegIndex], ...partial };
      return { ...d, segments: segs };
    });
  };

  const sectionCls = () => {
    return 'rounded-lg p-3 transition-all';
  };

  // 选中数字人元素
  if (selectedElement.type === 'digital_human') {
    return (
      <div className="p-3 space-y-3">
        <h3 className="text-xs font-semibold text-brand-purple uppercase tracking-wider flex items-center gap-1.5"><IconUser size={14} /> 数字人</h3>
        <label className="flex items-center gap-2 text-xs text-foreground/70 cursor-pointer">
          <input type="checkbox" checked={seg.digital_human.enabled}
            onChange={(e) => updateSeg({ digital_human: { ...seg.digital_human, enabled: e.target.checked } })}
            className="w-4 h-4 rounded" />
          显示数字人
        </label>
        {seg.digital_human.enabled && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">水平位置 {seg.digital_human.position.x}%</label>
              <input type="range" min={0} max={100} value={seg.digital_human.position.x}
                onChange={(e) => updateSeg({ digital_human: { ...seg.digital_human, position: { ...seg.digital_human.position, x: parseInt(e.target.value) } } })}
                className="w-full accent-purple-500" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">垂直位置 {seg.digital_human.position.y}%</label>
              <input type="range" min={0} max={100} value={seg.digital_human.position.y}
                onChange={(e) => updateSeg({ digital_human: { ...seg.digital_human, position: { ...seg.digital_human.position, y: parseInt(e.target.value) } } })}
                className="w-full accent-purple-500" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">缩放 {seg.digital_human.scale}%</label>
              <input type="range" min={10} max={300} value={seg.digital_human.scale}
                onChange={(e) => updateSeg({ digital_human: { ...seg.digital_human, scale: parseInt(e.target.value) } })}
                className="w-full accent-purple-500" />
            </div>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/60">在画布上拖拽数字人可直接调整位置</p>
      </div>
    );
  }

  // 选中字幕元素
  if (selectedElement.type === 'subtitle') {
    return (
      <div className="p-3 space-y-3">
        <h3 className="text-xs font-semibold text-brand-amber uppercase tracking-wider flex items-center gap-1.5"><IconType size={14} /> 字幕</h3>
        <label className="flex items-center gap-2 text-xs text-foreground/70 cursor-pointer">
          <input type="checkbox" checked={seg.subtitle.enabled}
            onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, enabled: e.target.checked } })}
            className="w-4 h-4 rounded" />
          显示字幕
        </label>
        {seg.subtitle.enabled && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">样式</label>
              <div className="grid grid-cols-2 gap-1">
                {SUBTITLE_STYLES.map(s => (
                  <button key={s.value}
                    onClick={() => updateSeg({ subtitle: { ...seg.subtitle, style_id: s.value } })}
                    className={`text-[10px] px-2 py-1.5 rounded border transition ${
                      seg.subtitle.style_id === s.value ? 'border-brand-blue bg-brand-blue/15 text-brand-blue' : 'border-border text-muted-foreground hover:border-foreground/30'
                    }`}>{s.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">位置</label>
              <div className="flex gap-1">
                {(['top', 'center', 'bottom'] as const).map(p => (
                  <button key={p}
                    onClick={() => updateSeg({ subtitle: { ...seg.subtitle, position: p } })}
                    className={`flex-1 text-[10px] py-1.5 rounded border transition ${
                      seg.subtitle.position === p ? 'border-brand-blue bg-brand-blue/15 text-brand-blue' : 'border-border text-muted-foreground'
                    }`}>{p === 'top' ? '顶部' : p === 'center' ? '居中' : '底部'}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">动画</label>
              <div className="flex gap-1">
                {(['none', 'fadeIn', 'typewriter'] as const).map(a => (
                  <button key={a}
                    onClick={() => updateSeg({ subtitle: { ...seg.subtitle, animation: a } })}
                    className={`flex-1 text-[10px] py-1.5 rounded border transition ${
                      seg.subtitle.animation === a ? 'border-brand-blue bg-brand-blue/15 text-brand-blue' : 'border-border text-muted-foreground'
                    }`}>{a === 'none' ? '无' : a === 'fadeIn' ? '淡入' : '逐字'}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 默认：片段属性（带步骤联动高亮）
  return (
    <div ref={containerRef} className="p-3 space-y-2 overflow-y-auto">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1"><IconFilm size={14} /> 片段 {currentSegIndex + 1}</h3>

      {/* 类型 + 时长 */}
      <div className="rounded-lg p-3 space-y-2">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">类型</label>
          <div className="flex flex-wrap gap-1">
            {TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.value}
                  onClick={() => updateSeg({ type: t.value })}
                  className={`text-[10px] px-2 py-1.5 rounded-md border flex items-center gap-1 transition-colors ${
                    seg.type === t.value ? 'border-brand-blue bg-brand-blue/15 text-brand-blue' : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}><Icon size={12} />{t.label}</button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">时长 {seg.duration_sec}s</label>
          <input type="range" min={1} max={30} step={0.5} value={seg.duration_sec}
            onChange={(e) => updateSeg({ duration_sec: parseFloat(e.target.value) })}
            className="w-full accent-blue-500" />
        </div>
      </div>

      {/* 口播文案 — 关联「写文案」步骤 */}
      <div id="section-content" className={sectionCls()}>
        <label className="text-[10px] text-muted-foreground block mb-1 flex items-center gap-1">
          <IconMic size={12} /> 口播文案
        </label>
        <textarea value={seg.narration_text} rows={3}
          onChange={(e) => updateSeg({ narration_text: e.target.value })}
          placeholder="输入口播内容，支持 {变量名}"
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-ring resize-none" />
      </div>

      {/* 场景图 — 关联「配场景」步骤 */}
      <div id="section-scene" className={sectionCls()}>
        <label className="text-[10px] text-muted-foreground block mb-1 flex items-center gap-1">
          <IconImage size={12} /> 场景图
        </label>
        <FileUploader label="" value={seg.scene_image_url} onChange={(url) => updateSeg({ scene_image_url: url })} accept="image/*" placeholder="拖拽或点击上传" />
        <div className="mt-1.5">
          <textarea value={seg.scene_description} rows={2}
            onChange={(e) => updateSeg({ scene_description: e.target.value })}
            placeholder="画面描述，辅助 AI 理解"
            className="w-full bg-secondary border border-border rounded-md px-2.5 py-1.5 text-[12px] placeholder-muted-foreground resize-none" />
          <AIPromptButton />
        </div>
      </div>

      {/* 字幕样式 — 关联「字幕样式」步骤 */}
      <div id="section-subtitle" className={sectionCls()}>
        <label className="text-[10px] text-muted-foreground block mb-1.5 flex items-center gap-1">
          <IconType size={12} /> 字幕
        </label>
        <div className="flex items-center gap-2 mb-2">
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
            <input type="checkbox" checked={seg.subtitle.enabled}
              onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, enabled: e.target.checked } })}
              className="w-3.5 h-3.5 rounded" />
            启用
          </label>
        </div>
        {seg.subtitle.enabled && (
          <div className="grid grid-cols-3 gap-1">
            {SUBTITLE_STYLES.map(s => (
              <button key={s.value}
                onClick={() => updateSeg({ subtitle: { ...seg.subtitle, style_id: s.value } })}
                className={`text-[10px] px-1.5 py-1 rounded border transition ${
                  seg.subtitle.style_id === s.value ? 'border-brand-blue bg-brand-blue/15 text-brand-blue' : 'border-border text-muted-foreground hover:border-foreground/30'
                }`}>{s.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* 转场 — 关联「转场动画」步骤 */}
      <div id="section-transition" className={sectionCls()}>
        <label className="text-[10px] text-muted-foreground block mb-1.5 flex items-center gap-1">
          <IconSparkles size={12} /> 转场效果
        </label>
        <select value={seg.transition.type}
          onChange={(e) => updateSeg({ transition: { ...seg.transition, type: e.target.value } })}
          className="w-full bg-secondary border border-border rounded-md px-2 py-1.5 text-[12px]">
          {TRANSITIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* 数字人开关 — 关联「选数字人」步骤 */}
      <div id="section-dh" className={sectionCls()}>
        <label className="flex items-center gap-2 text-[11px] cursor-pointer">
          <input type="checkbox" checked={seg.digital_human.enabled}
            onChange={(e) => updateSeg({ digital_human: { ...seg.digital_human, enabled: e.target.checked } })}
            className="w-3.5 h-3.5 rounded" />
          <IconUser size={14} /> 数字人出镜
        </label>
      </div>
    </div>
  );
}
