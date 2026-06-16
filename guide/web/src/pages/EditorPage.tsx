import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditorStore } from '../store/editorStore';
import type { CanvasElement, DSL, EditorObject, Segment } from '../store/editorStore';
import VideoCanvas from '../components/VideoCanvas';
import Timeline from '../components/Timeline';
import AssetLibrary from '../components/AssetLibrary';
import FileUploader from '../components/FileUploader';
import { IconAlertCircle, IconArrowRight, IconCheck, IconChevronLeft, IconClock, IconCopy, IconEye, IconEyeOff, IconFilm, IconGrid, IconImage, IconLayers, IconLayout, IconMic, IconMousePointer, IconMusic, IconPalette, IconPlus, IconSave, IconSettings2, IconSparkles, IconTrash, IconType, IconUpload, IconUser, IconVideo, IconZap } from '../components/Icons';

import { PRESET_TEMPLATES } from '../data/presetTemplates';
import ConfirmDialog from '../components/ConfirmDialog';

interface PipelineOption {
  key: string;
  name: string;
  description: string;
  requires_digital_human?: boolean;
}

interface ConfigDiagnostics {
  providers: Array<{
    key: string;
    name: string;
    configured: boolean;
    used_for: string[];
    fallback: string;
  }>;
  pipelines: Record<string, {
    blockers: string[];
    warnings: string[];
    provider_keys: string[];
  }>;
}

type ApiSegment = Partial<Omit<Segment, 'subtitle'>> & {
  subtitle?: Partial<Segment['subtitle']>;
};

function getCanvasSelectionKey(selection: CanvasElement) {
  if (selection.type === 'none') return 'none';
  if (selection.type === 'scene' || selection.type === 'digital_human' || selection.type === 'subtitle') {
    return `${selection.type}:${selection.segIndex}`;
  }
  if (selection.type === 'overlay') return `overlay:${selection.segIndex}:${selection.overlayIndex}`;
  return `object:${selection.segIndex}:${selection.objectIndex}`;
}

type ToolKey = 'avatar' | 'text' | 'shape' | 'motion' | 'media' | 'captions' | 'interactivity' | 'record';

type BrandKit = {
  id: string;
  name: string;
  description: string;
  brandColor: string;
  backgroundColor: string;
  textColor: string;
  subtitleStyle: Segment['subtitle']['style_id'];
  subtitlePosition: Segment['subtitle']['position'];
  logoLabel: string;
  titleText: string;
};

const BRAND_KITS: BrandKit[] = [
  {
    id: 'enterprise-blue',
    name: '企业蓝',
    description: '适合培训、SaaS、企业介绍',
    brandColor: '#1d4ed8',
    backgroundColor: '#f6f8fb',
    textColor: '#ffffff',
    subtitleStyle: 'default',
    subtitlePosition: 'bottom',
    logoLabel: '品牌',
    titleText: '关键信息',
  },
  {
    id: 'growth-green',
    name: '增长绿',
    description: '适合可持续、健康、教育内容',
    brandColor: '#15803d',
    backgroundColor: '#f4fbf6',
    textColor: '#ffffff',
    subtitleStyle: 'brand-elegant',
    subtitlePosition: 'bottom',
    logoLabel: '增长',
    titleText: '可持续发展',
  },
  {
    id: 'retail-coral',
    name: '零售珊瑚',
    description: '适合导购、促销、社媒短视频',
    brandColor: '#e11d48',
    backgroundColor: '#fff7f7',
    textColor: '#ffffff',
    subtitleStyle: 'subtitle-card',
    subtitlePosition: 'bottom',
    logoLabel: '店铺',
    titleText: '限时优惠',
  },
];

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dsl = useEditorStore(s => s.dsl);
  const setDsl = useEditorStore(s => s.setDsl);
  const updateDsl = useEditorStore(s => s.updateDsl);
  const undo = useEditorStore(s => s.undo);
  const redo = useEditorStore(s => s.redo);
  const reorderSegment = useEditorStore(s => s.reorderSegment);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const selectedElement = useEditorStore(s => s.selectedElement);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const showPresets = useEditorStore(s => s.showPresets);
  const setShowPresets = useEditorStore(s => s.setShowPresets);
  const setCurrentSegIndex = useEditorStore(s => s.setCurrentSegIndex);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingState, setSavingState] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [selectedDhId, setSelectedDhId] = useState('');
  const [showProps, setShowProps] = useState(true);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [configDiagnostics, setConfigDiagnostics] = useState<ConfigDiagnostics | null>(null);
  const [pipelineKey, setPipelineKey] = useState('digital_human');
  const [inputMode, setInputMode] = useState<'template' | 'topic' | 'script'>('template');
  const [topic, setTopic] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [showRenderReview, setShowRenderReview] = useState(false);
  const [messageDialog, setMessageDialog] = useState<{ title: string; message: string; destructive?: boolean } | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'design' | 'scene' | 'object' | 'generate'>('design');
  const [sceneSearch, setSceneSearch] = useState('');
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(176);
  const [rightPanelWidth, setRightPanelWidth] = useState(288);
  const previousSelectionKey = useRef('');

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await fetch(`/api/templates/${id}`);
      const data = await res.json();
      const raw = data.dsl_json;
      if (raw && raw.segments) {
        raw.globalConfig = {
          canvas_width: 1080,
          canvas_height: 1920,
          fps: 30,
          bgm_url: '',
          bgm_volume: 0.3,
          output_format: 'mp4',
          background_color: '#f6f6f6',
          bgm_enabled: Boolean(raw.globalConfig?.bgm_url),
          bgm_loop: true,
          transition_enabled: false,
          brand_logo_url: '',
          brand_color: '#4f46e5',
          output_resolution: '1080p',
          aspect_ratio: '9:16',
          ...raw.globalConfig,
        };
        raw.segments = raw.segments.map((seg: ApiSegment, i: number) => ({
          id: seg.id || `seg-${i}`, type: seg.type || 'narration',
          narration_text: seg.narration_text || '', duration_sec: seg.duration_sec || 5,
          scene_image_url: seg.scene_image_url || '', scene_description: seg.scene_description || '',
          camera_shot: seg.camera_shot || '', segment_bgm_url: seg.segment_bgm_url || '',
          subtitle: { enabled: seg.subtitle?.enabled ?? true, style_id: seg.subtitle?.style_id || 'default', position: seg.subtitle?.position || 'bottom', animation: seg.subtitle?.animation || 'fadeIn' },
          transition: seg.transition || { type: 'none', duration: 0.5 },
          digital_human: seg.digital_human || { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          overlays: Array.isArray(seg.overlays) ? seg.overlays : [],
          thumbnail_url: seg.thumbnail_url || seg.scene_image_url || '',
          diagnostics: Array.isArray(seg.diagnostics) ? seg.diagnostics : [],
          layout: seg.layout || 'avatar-center',
          avatar_id: seg.avatar_id || '',
          voice_id: seg.voice_id || '',
          objects: Array.isArray(seg.objects) ? seg.objects : [],
        }));
      }
      setDsl(raw);
      setPipelineKey(raw.meta?.pipeline_key || 'digital_human');
      setInputMode(raw.meta?.input_mode || 'template');
      setTopic(raw.meta?.topic || '');
      setScriptText(raw.meta?.script_text || '');
      setSavingState('saved');
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [id, setDsl]);

  useEffect(() => {
    void Promise.resolve().then(fetchTemplate);
  }, [fetchTemplate]);
  useEffect(() => {
    fetch('/api/renders/pipelines')
      .then(r => r.json())
      .then((items) => {
        setPipelines(items);
        if (Array.isArray(items) && !items.some((p) => p.key === pipelineKey) && items[0]) {
          setPipelineKey(items[0].key);
        }
      })
      .catch(() => {});
  }, [pipelineKey]);

  useEffect(() => {
    fetch('/api/config/diagnostics')
      .then(r => r.json())
      .then((diagnostics) => setConfigDiagnostics(diagnostics))
      .catch(() => setConfigDiagnostics(null));
  }, []);

  const updateEditorDsl = useCallback((updater: (dsl: DSL) => DSL) => {
    updateDsl(updater);
    setSavingState('dirty');
  }, [updateDsl]);

  const saveTemplate = useCallback(async () => {
    if (!dsl) return;
    setSaving(true);
    setSavingState('saving');
    try {
      const dslToSave = {
        ...dsl,
        meta: {
          ...dsl.meta,
          pipeline_key: pipelineKey,
          input_mode: inputMode,
          topic,
          script_text: scriptText,
        },
      };
      await fetch(`/api/templates/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dsl_json: dslToSave }),
      });
      setSavingState('saved');
    } catch (e) { console.error(e); setSavingState('dirty'); } finally { setSaving(false); }
  }, [dsl, id, pipelineKey, inputMode, topic, scriptText]);

  const handleBack = () => {
    if (savingState === 'dirty') {
      setShowExitDialog(true);
      return;
    }
    navigate('/');
  };

  const saveAndExit = async () => {
    await saveTemplate();
    setShowExitDialog(false);
    navigate('/');
  };

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (savingState !== 'dirty') return;
      event.preventDefault();
      event.returnValue = '';
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextEditing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveTemplate();
        return;
      }
      if (isTextEditing) return;
      if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [redo, saveTemplate, savingState, undo]);

  useEffect(() => {
    const selectionKey = getCanvasSelectionKey(selectedElement);
    if (previousSelectionKey.current === selectionKey) return;
    previousSelectionKey.current = selectionKey;

    if (selectedElement.type === 'scene') {
      setInspectorTab('scene');
    } else if (
      selectedElement.type === 'object' ||
      selectedElement.type === 'overlay' ||
      selectedElement.type === 'digital_human' ||
      selectedElement.type === 'subtitle'
    ) {
      setInspectorTab('object');
    } else if (inspectorTab === 'object') {
      setInspectorTab('scene');
    }
  }, [inspectorTab, selectedElement]);

  const executeRender = async () => {
    if (!dsl) return;
    const selectedPipeline = pipelines.find(p => p.key === pipelineKey);
    const missing = getRenderIssues(dsl, selectedPipeline, selectedDhId, inputMode, topic, scriptText, configDiagnostics);
    if (missing.length > 0) return;
    await saveTemplate();
    const isAIFullAuto = pipelineKey === 'ai_full_auto';
    const endpoint = isAIFullAuto ? '/api/renders/ai-generate' : '/api/renders';
    const body = isAIFullAuto
      ? {
          template_id: id,
          digital_human_id: selectedDhId,
          topic,
          script_text: scriptText,
          variables: {},
          max_retries: 1,
        }
      : {
          template_id: id,
          digital_human_id: selectedDhId || undefined,
          pipeline_key: pipelineKey,
          input_mode: inputMode,
          topic,
          script_text: scriptText,
          variables: {},
          max_retries: 1,
        };
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessageDialog({ title: '生成失败', message: err.error || '无法提交生成任务，请检查任务参数后重试。', destructive: true });
      return;
    }
    const job = await res.json();
    navigate(`/render/${job.id}`);
  };

  const openRenderReview = () => setShowRenderReview(true);

  const jumpToRenderIssue = (issue: string) => {
    if (!dsl) return;
    if (issue.includes('文案') || issue.includes('脚本')) {
      const index = dsl.segments.findIndex((seg) => !seg.narration_text.trim());
      setCurrentSegIndex(index >= 0 ? index : currentSegIndex);
      setInspectorTab('scene');
    } else if (issue.includes('场景')) {
      const index = dsl.segments.findIndex((seg) => !seg.scene_image_url && !seg.scene_description.trim());
      setCurrentSegIndex(index >= 0 ? index : currentSegIndex);
      setInspectorTab('scene');
      setActiveTool('media');
    } else if (issue.includes('数字人')) {
      setActiveTool('avatar');
      setInspectorTab('scene');
    } else if (issue.includes('品牌') || issue.includes('Logo')) {
      setInspectorTab('design');
    }
    setShowRenderReview(false);
  };

  const applyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    if (!dsl) return;
    const segs = preset.segments.map((s, i) => ({
      id: `seg-${Date.now()}-${i}`, type: s.type as Segment['type'], narration_text: s.narration_text, duration_sec: s.duration_sec,
      scene_image_url: '', scene_description: s.scene_description, camera_shot: s.camera_shot, segment_bgm_url: '',
      subtitle: {
        enabled: true,
        style_id: s.subtitle.style_id,
        position: s.subtitle.position as Segment['subtitle']['position'],
        animation: s.subtitle.animation as Segment['subtitle']['animation'],
      },
      transition: s.transition, digital_human: s.digital_human, overlays: [],
      thumbnail_url: '',
      diagnostics: [],
      layout: 'avatar-center' as const,
      avatar_id: '',
      voice_id: '',
      objects: [],
    }));
    updateEditorDsl((draft) => ({ ...draft, meta: { ...draft.meta, name: preset.name, type: preset.type }, segments: segs, variables: preset.variables }));
    setCurrentSegIndex(0);
    setShowPresets(false);
  };

  const createSegment = (): Segment => ({
    id: `seg-${Date.now()}`,
    type: 'narration',
    narration_text: '',
    duration_sec: 5,
    scene_image_url: '',
    scene_description: '',
    camera_shot: '',
    segment_bgm_url: '',
    subtitle: { enabled: true, style_id: 'default', position: 'bottom', animation: 'fadeIn' },
    transition: { type: 'none', duration: 0.5 },
    digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
    overlays: [],
    thumbnail_url: '',
    diagnostics: [],
    layout: 'avatar-center',
    avatar_id: '',
    voice_id: '',
    objects: [],
  });

  const addSegment = () => {
    if (!dsl) return;
    const next = createSegment();
    updateEditorDsl((draft) => ({ ...draft, segments: [...draft.segments, next] }));
    setCurrentSegIndex(dsl.segments.length);
  };

  const duplicateSegment = (index: number) => {
    if (!dsl) return;
    const source = dsl.segments[index];
    if (!source) return;
    const copy = { ...source, id: `seg-${Date.now()}`, narration_text: source.narration_text };
    const segments = [...dsl.segments.slice(0, index + 1), copy, ...dsl.segments.slice(index + 1)];
    updateEditorDsl((draft) => ({ ...draft, segments }));
    setCurrentSegIndex(index + 1);
  };

  const deleteSegment = (index: number) => {
    if (!dsl || dsl.segments.length <= 1) return;
    const segments = dsl.segments.filter((_, i) => i !== index);
    updateEditorDsl((draft) => ({ ...draft, segments }));
    setCurrentSegIndex(Math.max(0, Math.min(index, segments.length - 1)));
  };

  const renameTemplate = (name: string) => {
    if (!dsl) return;
    updateEditorDsl((draft) => ({ ...draft, meta: { ...draft.meta, name } }));
  };

  const moveSegment = (fromIndex: number, toIndex: number) => {
    reorderSegment(fromIndex, toIndex);
    setSavingState('dirty');
  };

  const addObject = (type: EditorObject['type'], patch: Partial<EditorObject> = {}) => {
    if (!dsl) return;
    const object = createEditorObject(type, patch.label || patch.text || patch.asset_url
      ? patch
      : type === 'text'
        ? { label: '文字', text: '新文本' }
        : { label: type === 'logo' ? 'Logo' : '贴片' });
    updateEditorDsl((draft) => {
      const segments = [...draft.segments];
      const seg = segments[currentSegIndex];
      const objects = [...(seg.objects || []), object];
      segments[currentSegIndex] = { ...seg, objects };
      return { ...draft, segments };
    });
    setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: dsl.segments[currentSegIndex]?.objects?.length || 0 });
    setInspectorTab('object');
    setActiveTool(null);
  };

  const showFeatureNote = (title: string, message: string) => {
    setMessageDialog({ title, message });
    setActiveTool(null);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-background text-muted-foreground">加载中...</div>;
  if (!dsl) return <div className="h-screen flex items-center justify-center bg-background text-muted-foreground">模板不存在</div>;
  const totalDuration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const selectedPipeline = pipelines.find(p => p.key === pipelineKey);
  const renderIssues = getRenderIssues(dsl, selectedPipeline, selectedDhId, inputMode, topic, scriptText, configDiagnostics);
  const readyToRender = renderIssues.length === 0;
  const filteredSegments = dsl.segments
    .map((seg, index) => ({ seg, index }))
    .filter(({ seg, index }) => {
      const query = sceneSearch.trim().toLowerCase();
      if (!query) return true;
      return `${index + 1} ${seg.narration_text} ${seg.scene_description} ${seg.type}`.toLowerCase().includes(query);
    });

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 bg-card border-b border-border shrink-0 h-11">
        <div className="flex items-center gap-2">
          <button onClick={handleBack} className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <IconChevronLeft size={18} />
          </button>
          <div className="w-px h-4 bg-border" />
          <input
            value={dsl.meta.name}
            onChange={(e) => renameTemplate(e.target.value)}
            className="h-8 w-40 rounded-md border border-transparent bg-transparent px-2 text-[16px] font-medium outline-none hover:border-border focus:border-ring focus:bg-background"
            aria-label="项目名称"
          />
          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{dsl.meta.type}</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-1">
            <IconClock size={12} />
            {dsl.segments.length} 场景 · {totalDuration}s
          </span>
          <span className={`text-[10px] ml-1 ${savingState === 'dirty' ? 'text-brand-amber' : savingState === 'saving' ? 'text-muted-foreground' : 'text-brand-green'}`}>
            {savingState === 'dirty' ? '未保存' : savingState === 'saving' ? '保存中' : '已保存'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={undo} className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="撤销">
            <IconArrowRight size={16} className="rotate-180" />
          </button>
          <button onClick={redo} className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="重做">
            <IconArrowRight size={16} />
          </button>
          <ToolLauncher
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            addObject={addObject}
            showFeatureNote={showFeatureNote}
            selectedDhId={selectedDhId}
            onSelectDh={setSelectedDhId}
          />
          <button onClick={() => setShowProps(!showProps)}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${showProps ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
            <IconLayout size={18} />
          </button>
          <button onClick={() => window.open(`/api/hyperframes/${id}/preview-html`, '_blank')}
            className="w-9 h-9 rounded-md flex items-center justify-center text-brand-blue hover:bg-brand-blue/10 transition-colors">
            <IconFilm size={18} />
          </button>
          <button onClick={saveTemplate} disabled={saving}
            className="h-9 px-3 text-[14px] flex items-center gap-1.5 bg-secondary text-secondary-foreground hover:bg-accent rounded-md transition-colors disabled:opacity-50">
            <IconSave size={16} />
            {saving ? '...' : '保存'}
          </button>
          <button onClick={openRenderReview}
            className="h-9 px-4 text-[14px] flex items-center gap-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-md transition-opacity font-medium">
            <IconZap size={16} />
            生成视频
          </button>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 flex overflow-hidden">
        <SceneNavigator
          items={filteredSegments}
          search={sceneSearch}
          setSearch={setSceneSearch}
          totalCount={dsl.segments.length}
          currentSegIndex={currentSegIndex}
          onSelect={setCurrentSegIndex}
          onAdd={addSegment}
          onDuplicate={duplicateSegment}
          onDelete={deleteSegment}
          onMoveUp={(index) => moveSegment(index, index - 1)}
          onMoveDown={(index) => moveSegment(index, index + 1)}
          onReorder={(fromIndex, toIndex) => moveSegment(fromIndex, toIndex)}
          style={{ width: leftPanelWidth }}
        />
        <PanelResizer onResize={(delta) => setLeftPanelWidth(w => Math.max(160, Math.min(320, w + delta)))} />

        {/* 中间画布 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <VideoCanvas />
          <ScriptWorkspace
            dsl={dsl}
            currentSegIndex={currentSegIndex}
            updateDsl={updateEditorDsl}
            selectedDhId={selectedDhId}
          />
          <Timeline />
        </div>

        {/* 右侧属性 */}
        {showProps && (
          <>
            <PanelResizer onResize={(delta) => setRightPanelWidth(w => Math.max(240, Math.min(420, w - delta)))} />
            <InspectorPanel
              tab={inspectorTab}
              setTab={setInspectorTab}
              dsl={dsl}
              currentSegIndex={currentSegIndex}
              selectedElement={selectedElement}
              updateDsl={updateEditorDsl}
              renderControlProps={{
                dsl,
                pipelines,
                pipelineKey,
                setPipelineKey,
                inputMode,
                setInputMode,
                topic,
                setTopic,
                scriptText,
                setScriptText,
                selectedDhId,
                onRender: openRenderReview,
                diagnostics: configDiagnostics,
              }}
              style={{ width: rightPanelWidth }}
            />
          </>
        )}
      </div>

      {/* 预置模板弹窗 */}
      {showPresets && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowPresets(false)}>
          <div className="bg-card rounded-xl shadow-2xl w-[700px] max-h-[80vh] overflow-hidden border border-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold">选择预置模板</h2>
              <button onClick={() => setShowPresets(false)} className="text-muted-foreground hover:text-foreground text-xl transition-colors">×</button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              <div className="grid grid-cols-2 gap-4">
                {PRESET_TEMPLATES.map((preset, i) => (
                  <div key={i} onClick={() => applyPreset(preset)}
                    className="border border-border rounded-lg p-4 cursor-pointer hover:border-brand-blue hover:bg-brand-blue/10 transition-colors group">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{preset.coverEmoji}</span>
                      <div>
                        <h3 className="text-sm font-medium group-hover:text-brand-blue transition-colors">{preset.name}</h3>
                        <span className="text-[10px] text-muted-foreground">{preset.type} · {preset.segments.length} 个片段</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2">{preset.description}</p>
                    <div className="flex gap-1 flex-wrap">
                      {preset.segments.map((s, j) => (
                        <span key={j} className="text-[9px] px-1.5 py-0.5 bg-secondary rounded-full text-muted-foreground">
                          {s.type === 'narration' ? '口播' : s.type === 'product' ? '产品' : s.type === 'scene' ? '场景' : s.type === 'transition' ? '转场' : '结尾'} {s.duration_sec}s
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showRenderReview && (
        <RenderReviewDialog
          dsl={dsl}
          pipeline={selectedPipeline}
          inputMode={inputMode}
          topic={topic}
          scriptText={scriptText}
          selectedDhId={selectedDhId}
          issues={renderIssues}
          ready={readyToRender}
          diagnostics={configDiagnostics}
          onCancel={() => setShowRenderReview(false)}
          onConfirm={executeRender}
          onIssueClick={jumpToRenderIssue}
        />
      )}
      <ConfirmDialog
        open={Boolean(messageDialog)}
        title={messageDialog?.title || ''}
        message={messageDialog?.message || ''}
        confirmLabel="知道了"
        destructive={messageDialog?.destructive}
        onConfirm={() => setMessageDialog(null)}
        onCancel={() => setMessageDialog(null)}
      />
      {showExitDialog && (
        <UnsavedExitDialog
          saving={saving}
          onCancel={() => setShowExitDialog(false)}
          onDiscard={() => navigate('/')}
          onSaveAndExit={saveAndExit}
        />
      )}
    </div>
  );
}

function ToolLauncher({
  activeTool,
  setActiveTool,
  addObject,
  showFeatureNote,
  selectedDhId,
  onSelectDh,
}: {
  activeTool: ToolKey | null;
  setActiveTool: (tool: ToolKey | null) => void;
  addObject: (type: EditorObject['type'], patch?: Partial<EditorObject>) => void;
  showFeatureNote: (title: string, message: string) => void;
  selectedDhId: string;
  onSelectDh: (id: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tools: Array<{ key: ToolKey; label: string; icon: ReactNode; badge?: string }> = [
    { key: 'avatar', label: '数字人', icon: <IconUser size={15} /> },
    { key: 'text', label: '文字', icon: <IconType size={15} /> },
    { key: 'shape', label: '形状', icon: <IconGrid size={15} /> },
    { key: 'motion', label: '动作', icon: <IconSparkles size={15} />, badge: '新功能' },
    { key: 'media', label: '媒体', icon: <IconImage size={15} /> },
    { key: 'captions', label: '字幕', icon: <IconLayers size={15} /> },
    { key: 'interactivity', label: '互动', icon: <IconMousePointer size={15} /> },
    { key: 'record', label: '录制', icon: <IconVideo size={15} /> },
  ];

  useEffect(() => {
    if (!activeTool) return;
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
    <div ref={wrapperRef} className="relative flex items-center gap-0.5 border-l border-r border-border px-2 mx-1">
      {tools.map((tool) => (
        <button
          key={tool.key}
          type="button"
          aria-label={`tool-${tool.key}`}
          data-tool={tool.key}
          onClick={() => setActiveTool(activeTool === tool.key ? null : tool.key)}
          className={`relative h-9 px-2.5 rounded-md text-[11px] leading-none flex flex-col items-center justify-center gap-0.5 transition-colors ${
            activeTool === tool.key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          {tool.icon}
          <span>{tool.label}</span>
          {tool.badge && <span className="absolute -top-1 right-0 text-[7px] px-1 rounded bg-brand-blue text-white">{tool.badge}</span>}
        </button>
      ))}
      {activeTool && (
        <ToolPopover
          tool={activeTool}
          addObject={addObject}
          close={() => setActiveTool(null)}
          showFeatureNote={showFeatureNote}
          selectedDhId={selectedDhId}
          onSelectDh={onSelectDh}
        />
      )}
    </div>
  );
}

function ToolPopover({
  tool,
  addObject,
  close,
  showFeatureNote,
  selectedDhId,
  onSelectDh,
}: {
  tool: ToolKey;
  addObject: (type: EditorObject['type'], patch?: Partial<EditorObject>) => void;
  close: () => void;
  showFeatureNote: (title: string, message: string) => void;
  selectedDhId: string;
  onSelectDh: (id: string) => void;
}) {
  const [mediaTab, setMediaTab] = useState<'scene' | 'sound'>('scene');

  return (
    <div className="absolute left-2 top-10 z-40 w-[360px] rounded-lg border border-border bg-card shadow-2xl p-3">
      {tool === 'avatar' && (
        <div className="space-y-3 flex flex-col" style={{ maxHeight: 420 }}>
          <div className="flex items-center justify-between shrink-0">
            <div className="text-sm font-semibold">数字人素材库</div>
            <button type="button" onClick={() => showFeatureNote('创建形象', '当前版本保留数字人训练与服装创建的入口语义，但不接 Synthesia 私有能力；请在数字人管理中维护可用资产。')} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs">创建形象</button>
          </div>
          <div className="flex-1 min-h-0 -mx-1">
            <AssetLibrary tab="dh" selectedDhId={selectedDhId} onSelectDh={onSelectDh} showSearch={false} />
          </div>
        </div>
      )}

      {tool === 'text' && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '标题 1', text: '标题 1', scale: 140, y: 24 },
            { label: '标题 2', text: '标题 2', scale: 120, y: 32 },
            { label: '副标题', text: '副标题文本', scale: 100, y: 70 },
            { label: '正文', text: '正文内容', scale: 90, y: 50 },
            { label: '说明文字', text: '说明文字', scale: 80, y: 84 },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => addObject('text', { label: item.label, text: item.text, scale: item.scale, position: { x: 50, y: item.y } })}
              className="h-16 rounded-md border border-border hover:border-foreground/40 hover:bg-accent text-left px-3"
            >
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-[10px] text-muted-foreground">添加到当前场景</div>
            </button>
          ))}
        </div>
      )}

      {tool === 'shape' && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '线条', shape: 'Line' },
            { label: '箭头', shape: 'Arrow' },
            { label: '矩形', shape: 'Square' },
            { label: '圆形', shape: 'Circle' },
            { label: '三角形', shape: 'Triangle' },
            { label: '星形', shape: 'Star' },
            { label: '边框', shape: 'Frame' },
            { label: '标签', shape: 'Label' },
          ].map((item) => (
            <button
              key={item.shape}
              type="button"
              onClick={() => addObject('sticker', { label: item.label, text: item.label, scale: 90, metadata: { source: 'shape', shape_type: item.shape } })}
              className="h-16 rounded-md border border-border hover:border-foreground/40 hover:bg-accent flex flex-col items-center justify-center gap-1 text-xs"
            >
              <IconGrid size={18} />
              {item.label}
            </button>
          ))}
        </div>
      )}

      {tool === 'motion' && (
        <div className="space-y-3 flex flex-col" style={{ maxHeight: 420 }}>
          <div className="flex items-center justify-between shrink-0">
            <div>
              <div className="text-sm font-semibold">动作素材库</div>
              <div className="text-[11px] text-muted-foreground">基于脚本添加动画提示与素材</div>
            </div>
            <span className="rounded bg-brand-blue/10 text-brand-blue px-2 py-1 text-[10px]">测试版</span>
          </div>
          <div className="flex-1 min-h-0 -mx-1">
            <AssetLibrary tab="anim" showSearch={false} />
          </div>
        </div>
      )}

      {tool === 'media' && (
        <div className="space-y-2 flex flex-col" style={{ maxHeight: 420 }}>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => setMediaTab('scene')} className={`flex-1 h-8 rounded-md text-xs ${mediaTab === 'scene' ? 'bg-accent' : 'hover:bg-accent'}`}>场景图</button>
            <button type="button" onClick={() => setMediaTab('sound')} className={`flex-1 h-8 rounded-md text-xs ${mediaTab === 'sound' ? 'bg-accent' : 'hover:bg-accent'}`}>音效</button>
          </div>
          <div className="flex-1 min-h-0 -mx-1">
            <AssetLibrary tab={mediaTab} showSearch />
          </div>
          <div className="grid grid-cols-2 gap-2 shrink-0 pt-1 border-t border-border">
            <button type="button" onClick={() => addObject('image', { label: '媒体素材', scale: 100, metadata: { source: 'media' } })} className="h-9 rounded-md border border-border hover:bg-accent text-xs flex items-center justify-center gap-1">
              <IconImage size={14} /> 图片/视频
            </button>
            <button type="button" onClick={() => addObject('logo', { label: 'Logo', scale: 80, position: { x: 12, y: 10 }, metadata: { source: 'media' } })} className="h-9 rounded-md border border-border hover:bg-accent text-xs flex items-center justify-center gap-1">
              <IconUpload size={14} /> Logo
            </button>
          </div>
        </div>
      )}

      {tool === 'captions' && (
        <div className="space-y-3 flex flex-col" style={{ maxHeight: 420 }}>
          <div className="text-sm font-semibold shrink-0">字幕样式库</div>
          <div className="flex-1 min-h-0 -mx-1">
            <AssetLibrary tab="subtitle" showSearch={false} />
          </div>
        </div>
      )}

      {tool === 'interactivity' && (
        <div className="space-y-3">
          <div className="rounded-lg bg-secondary p-4">
            <div className="text-[10px] text-brand-blue font-semibold">升级功能</div>
            <div className="mt-1 text-sm font-semibold">互动问题</div>
            <p className="mt-1 text-xs text-muted-foreground">添加互动占位对象，便于设计阶段排版和后续播放器扩展；当前渲染流水线会把它作为普通画布层处理。</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '按钮', text: '点击这里', kind: 'cta_button' as const, y: 70 },
              { label: '分支菜单', text: '选择路径', kind: 'branch_menu' as const, y: 58 },
              { label: '单选', text: '问题', kind: 'single_answer' as const, y: 50 },
              { label: '多选', text: '全选', kind: 'multiple_answers' as const, y: 50 },
              { label: '计分卡', text: '得分', kind: 'score_card' as const, y: 55 },
            ].map((item) => (
              <button
                key={item.kind}
                type="button"
                onClick={() => addObject('sticker', {
                  label: item.label,
                  text: item.text,
                  position: { x: 50, y: item.y },
                  scale: 100,
                  metadata: { source: 'interactivity', note: '播放交互能力后续在播放器 runtime 中实现。' },
                  interaction: { kind: item.kind, target_url: '', options: item.kind === 'cta_button' || item.kind === 'score_card' ? [] : ['选项 A', '选项 B'] },
                  style: { fill: item.kind === 'cta_button' ? '#4f46e5' : '#ffffff', textColor: item.kind === 'cta_button' ? '#ffffff' : '#111827', variant: item.kind },
                })}
                className="h-20 rounded-md border border-border hover:border-foreground/40 hover:bg-accent p-2 text-left"
              >
                <div className="text-xs font-medium">{item.label}</div>
                <div className="mt-2 h-8 rounded bg-secondary flex items-center justify-center text-[10px] text-muted-foreground">{item.text}</div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => showFeatureNote('互动运行时缺口', '互动对象已可排版、保存和复制；真正点击跳转、分支菜单和成绩结果需要播放器 runtime，当前不影响视频生成闭环。')} className="w-full h-9 rounded-md bg-secondary hover:bg-accent text-sm">查看运行时缺口</button>
        </div>
      )}

      {tool === 'record' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => addObject('image', {
              label: '屏幕录制',
              text: '屏幕录制',
              position: { x: 50, y: 54 },
              scale: 120,
              metadata: { source: 'record', note: '录屏权限流程尚未实现；请在对象面板绑定上传的 MP4。', duration_sec: 8 },
              style: { fill: '#111827', textColor: '#ffffff', variant: 'screen-recording' },
            })}
            className="w-full rounded-md border border-border hover:bg-accent p-3 text-left"
          >
            <div className="text-sm font-medium">屏幕录制</div>
            <div className="text-xs text-muted-foreground">添加录屏占位层，可在对象面板绑定 MP4</div>
          </button>
          <button type="button" onClick={() => addObject('image', { label: '录屏素材', scale: 100, metadata: { source: 'record' } })} className="w-full rounded-md border border-border hover:bg-accent p-3 text-left">
            <div className="text-sm font-medium">上传录屏</div>
            <div className="text-xs text-muted-foreground">把 MP4 作为当前视频素材管理</div>
          </button>
        </div>
      )}
    </div>
  );
}

function UnsavedExitDialog({
  saving,
  onCancel,
  onDiscard,
  onSaveAndExit,
}: {
  saving: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndExit: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-[16px] font-medium text-foreground">离开编辑器？</h3>
        <p className="text-[14px] text-muted-foreground mt-2">
          当前模板还有未保存修改。可以先保存再离开，也可以放弃本次修改。
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="h-9 px-4 text-[14px] bg-secondary text-secondary-foreground rounded-md hover:bg-accent">继续编辑</button>
          <button onClick={onDiscard} className="h-9 px-4 text-[14px] border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10">放弃离开</button>
          <button
            onClick={onSaveAndExit}
            disabled={saving}
            className="h-9 px-4 text-[14px] rounded-md font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
          >
            {saving ? '保存中...' : '保存并离开'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SceneNavigator({
  items,
  search,
  setSearch,
  totalCount,
  currentSegIndex,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onReorder,
  style,
}: {
  items: Array<{ seg: Segment; index: number }>;
  search: string;
  setSearch: (value: string) => void;
  totalCount: number;
  currentSegIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  style?: CSSProperties;
}) {
  return (
    <aside className="bg-card border-r border-border flex flex-col shrink-0" style={style}>
      <div className="p-2 border-b border-border">
        <button
          onClick={onAdd}
          className="w-full h-9 rounded-md flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground hover:bg-accent text-sm font-medium"
          title="新增场景"
        >
          <IconPlus size={15} />
          添加场景
        </button>
      </div>
      <div className="p-2 border-b border-border">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索场景"
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
            未找到场景
          </div>
        )}
        {items.map(({ seg, index }) => {
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
              onClick={() => onSelect(index)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelect(index); }}
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
                    <span className="text-[10px] font-medium text-foreground">场景 {index + 1}</span>
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
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onMoveUp(index); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') onMoveUp(index); }}
                  className={`w-6 h-6 rounded flex items-center justify-center ${index === 0 ? 'text-muted-foreground/30' : 'text-muted-foreground hover:text-foreground hover:bg-background'}`}
                  title="上移场景"
                >
                  <IconArrowRight size={12} className="-rotate-90" />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onMoveDown(index); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') onMoveDown(index); }}
                  className={`w-6 h-6 rounded flex items-center justify-center ${index >= totalCount - 1 ? 'text-muted-foreground/30' : 'text-muted-foreground hover:text-foreground hover:bg-background'}`}
                  title="下移场景"
                >
                  <IconArrowRight size={12} className="rotate-90" />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onDuplicate(index); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') onDuplicate(index); }}
                  className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background"
                  title="复制场景"
                >
                  <IconCopy size={13} />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onDelete(index); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') onDelete(index); }}
                  className={`w-6 h-6 rounded flex items-center justify-center ${
                    totalCount <= 1 ? 'text-muted-foreground/30' : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                  }`}
                  title="删除场景"
                >
                  <IconTrash size={13} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-2 border-t border-border">
        <button
          type="button"
          className="w-full h-9 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center gap-1.5"
          title="帮助"
        >
          <IconAlertCircle size={14} />
          帮助
        </button>
      </div>
    </aside>
  );
}

function getSegmentIssues(seg: Segment) {
  const issues: string[] = [];
  if (!seg.narration_text.trim()) issues.push('缺少脚本');
  if (!seg.scene_image_url && !seg.scene_description.trim()) issues.push('缺少场景');
  if (seg.duration_sec <= 0) issues.push('时长异常');
  if (seg.digital_human.enabled && !seg.avatar_id) issues.push('未绑定数字人资产');
  if (seg.objects?.some(obj => obj.locked && obj.visible === false)) issues.push('存在隐藏且锁定对象');
  if (seg.diagnostics?.length) issues.push(...seg.diagnostics);
  return issues;
}

function ScriptWorkspace({
  dsl,
  currentSegIndex,
  updateDsl,
  selectedDhId,
}: {
  dsl: DSL;
  currentSegIndex: number;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
  selectedDhId: string;
}) {
  const seg = dsl.segments[currentSegIndex];
  if (!seg) return null;
  const updateSeg = (partial: Partial<Segment>) => {
    updateDsl((draft) => {
      const segments = [...draft.segments];
      segments[currentSegIndex] = { ...segments[currentSegIndex], ...partial };
      return { ...draft, segments };
    });
  };

  return (
    <section className="h-44 bg-card border-t border-border shrink-0 flex flex-col">
      <div className="h-10 border-b border-border px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <IconMic size={16} />
          场景脚本
          <span className="text-[10px] text-muted-foreground">场景 {currentSegIndex + 1}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-1 bg-secondary rounded-md">{selectedDhId ? '数字人已选' : '未选数字人'}</span>
          <span className="px-2 py-1 bg-secondary rounded-md">中文</span>
          <span className="px-2 py-1 bg-secondary rounded-md">{seg.duration_sec}s</span>
          <button
            onClick={() => updateSeg({ digital_human: { ...seg.digital_human, enabled: !seg.digital_human.enabled } })}
            className="px-2 py-1 bg-secondary hover:bg-accent rounded-md"
          >
            {seg.digital_human.enabled ? '隐藏数字人' : '显示数字人'}
          </button>
          <button
            onClick={() => updateSeg({ subtitle: { ...seg.subtitle, enabled: !seg.subtitle.enabled } })}
            className="px-2 py-1 bg-secondary hover:bg-accent rounded-md"
          >
            {seg.subtitle.enabled ? '关闭字幕' : '开启字幕'}
          </button>
        </div>
      </div>
      <div className="flex-1 grid grid-cols-[160px_1fr] gap-4 p-4 overflow-hidden">
        <div className="rounded-lg bg-secondary border border-border p-3 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center mb-2">
              <IconMic size={16} className="text-muted-foreground" />
            </div>
            <div className="text-xs font-medium">旁白轨道</div>
            <div className="text-[10px] text-muted-foreground mt-1">用于 TTS 与口型同步</div>
          </div>
          <label className="text-[10px] text-muted-foreground">
            时长
            <input
              type="range"
              min={1}
              max={30}
              step={0.5}
              value={seg.duration_sec}
              onChange={(e) => updateSeg({ duration_sec: Number(e.target.value) })}
              className="w-full mt-1"
            />
          </label>
        </div>
        <textarea
          value={seg.narration_text}
          onChange={(e) => updateSeg({ narration_text: e.target.value })}
          placeholder="输入该场景的数字人口播脚本。成熟编辑器通常把画面编辑和脚本编辑并列显示，避免用户在属性面板里来回寻找文案。"
          className="w-full h-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-[16px] leading-7 outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    </section>
  );
}

function InspectorPanel({
  tab,
  setTab,
  dsl,
  currentSegIndex,
  selectedElement,
  updateDsl,
  renderControlProps,
  style,
}: {
  tab: 'design' | 'scene' | 'object' | 'generate';
  setTab: (tab: 'design' | 'scene' | 'object' | 'generate') => void;
  dsl: DSL;
  currentSegIndex: number;
  selectedElement: CanvasElement;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
  renderControlProps: RenderControlProps;
  style?: CSSProperties;
}) {
  const hasObjectSelection = selectedElement.type === 'object' || selectedElement.type === 'digital_human' || selectedElement.type === 'subtitle' || selectedElement.type === 'overlay';
  return (
    <aside className="bg-card border-l border-border shrink-0 flex flex-col" style={style}>
      <div className="h-11 border-b border-border flex">
        <button
          onClick={() => setTab('design')}
          className={`flex-1 text-sm font-medium ${tab === 'design' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          设计
        </button>
        <button
          onClick={() => setTab('scene')}
          className={`flex-1 text-sm font-medium ${tab === 'scene' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          分镜
        </button>
        <button
          onClick={() => setTab('object')}
          className={`flex-1 text-sm font-medium ${tab === 'object' ? 'text-foreground border-b-2 border-foreground' : hasObjectSelection ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50'}`}
        >
          对象
        </button>
        <button
          onClick={() => setTab('generate')}
          className={`flex-1 text-sm font-medium ${tab === 'generate' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          生成
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'design' ? (
          <DesignPanel dsl={dsl} currentSegIndex={currentSegIndex} updateDsl={updateDsl} />
        ) : tab === 'scene' ? (
          <ScenePanel dsl={dsl} currentSegIndex={currentSegIndex} updateDsl={updateDsl} />
        ) : tab === 'object' ? (
          <ObjectPanel dsl={dsl} currentSegIndex={currentSegIndex} selectedElement={selectedElement} updateDsl={updateDsl} />
        ) : (
          <GeneratePanel {...renderControlProps} />
        )}
      </div>
    </aside>
  );
}

function DesignPanel({
  dsl,
  currentSegIndex,
  updateDsl,
}: {
  dsl: DSL;
  currentSegIndex: number;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const cfg = dsl.globalConfig;
  const updateGlobal = (partial: Partial<DSL['globalConfig']>) => {
    updateDsl((draft) => ({ ...draft, globalConfig: { ...draft.globalConfig, ...partial } }));
  };
  const updateSeg = (partial: Partial<Segment>) => {
    updateDsl((draft) => {
      const segments = [...draft.segments];
      segments[currentSegIndex] = { ...segments[currentSegIndex], ...partial };
      return { ...draft, segments };
    });
  };
  const applyBrandKit = (kit: BrandKit) => {
    updateDsl((draft) => {
      const brandLogoUrl = draft.globalConfig.brand_logo_url || '';
      const segments = draft.segments.map((segment, index) => {
        const objects = [...(segment.objects || [])];
        if (index === currentSegIndex) {
          const logoIndex = objects.findIndex((object) => object.type === 'logo' || object.metadata?.note === 'brand-kit-logo');
          const logoPatch: Partial<EditorObject> = {
            label: brandLogoUrl ? 'Logo' : kit.logoLabel,
            asset_url: brandLogoUrl,
            position: { x: 12, y: 10 },
            scale: 72,
            style: { fill: kit.brandColor, textColor: kit.textColor, variant: kit.id },
            metadata: { source: 'media', note: 'brand-kit-logo' },
          };
          if (logoIndex >= 0) {
            objects[logoIndex] = { ...objects[logoIndex], ...logoPatch };
          } else {
            objects.push(createEditorObject('logo', logoPatch));
          }

          const titleIndex = objects.findIndex((object) => object.metadata?.note === 'brand-kit-title');
          const titlePatch: Partial<EditorObject> = {
            label: '品牌标题',
            text: kit.titleText,
            position: { x: 29, y: 72 },
            scale: 112,
            style: { fill: kit.brandColor, textColor: kit.textColor, variant: kit.id },
            metadata: { source: 'media', note: 'brand-kit-title' },
          };
          if (titleIndex >= 0) {
            objects[titleIndex] = { ...objects[titleIndex], ...titlePatch };
          } else {
            objects.push(createEditorObject('text', titlePatch));
          }
        }

        return {
          ...segment,
          subtitle: {
            ...segment.subtitle,
            enabled: true,
            style_id: kit.subtitleStyle,
            position: kit.subtitlePosition,
          },
          objects,
        };
      });

      return {
        ...draft,
        globalConfig: {
          ...draft.globalConfig,
          brand_color: kit.brandColor,
          background_color: kit.backgroundColor,
        },
        segments,
      };
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg border border-border bg-secondary/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">场景布局</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {seg.layout === 'avatar-left' ? '数字人靠左' : seg.layout === 'avatar-right' ? '数字人靠右' : seg.layout === 'media-grid' ? '媒体网格' : seg.layout === 'full-media' ? '全屏媒体' : '数字人居中'} · {cfg.aspect_ratio === '16:9' ? '16:9 横屏' : cfg.aspect_ratio === '1:1' ? '1:1 方形' : '9:16 竖屏'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateSeg({ scene_image_url: '', thumbnail_url: '', scene_description: '' })}
            className="h-8 px-3 rounded-md bg-background border border-border hover:bg-accent text-xs flex items-center gap-1.5"
          >
            <IconArrowRight size={13} className="rotate-180" />
            替换
          </button>
        </div>
        <select
          value={seg.layout || 'avatar-center'}
          onChange={(e) => updateSeg({ layout: e.target.value as Segment['layout'] })}
          className="mt-3 w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="avatar-left">数字人靠左</option>
          <option value="avatar-center">数字人居中</option>
          <option value="avatar-right">数字人靠右</option>
          <option value="media-grid">媒体网格</option>
          <option value="full-media">全屏媒体</option>
        </select>
      </div>
      <PanelSection title="背景" icon={<IconPalette size={15} />}>
        <label className="block text-xs text-muted-foreground mb-1">背景色</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={cfg.background_color || '#f6f6f6'}
            onChange={(e) => updateGlobal({ background_color: e.target.value })}
            className="w-10 h-9 rounded border border-border bg-background"
          />
          <input
            value={(cfg.background_color || '#f6f6f6').toUpperCase()}
            onChange={(e) => updateGlobal({ background_color: e.target.value })}
            className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </div>
        <label className="mt-3 flex items-center justify-between text-sm">
          背景媒体
          <input
            type="checkbox"
            checked={Boolean(seg.scene_image_url || seg.scene_description)}
            onChange={(e) => {
              if (!e.target.checked) updateSeg({ scene_image_url: '', scene_description: '' });
            }}
          />
        </label>
      </PanelSection>

      <PanelSection title="音乐" icon={<IconMusic size={15} />}>
        <label className="flex items-center justify-between text-sm">
          启用音乐
          <input
            type="checkbox"
            checked={cfg.bgm_enabled ?? Boolean(cfg.bgm_url)}
            onChange={(e) => updateGlobal({ bgm_enabled: e.target.checked })}
          />
        </label>
        <FileUploader
          value={cfg.bgm_url || ''}
          onChange={(url) => updateGlobal({ bgm_url: url, bgm_enabled: Boolean(url) })}
          accept="audio/*"
          placeholder="音乐文件 URL 或上传后的路径"
          previewType="audio"
          className="mt-3"
        />
        <label className="mt-3 block text-xs text-muted-foreground">音量 {Math.round((cfg.bgm_volume ?? 0.3) * 100)}%</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={cfg.bgm_volume ?? 0.3}
          onChange={(e) => updateGlobal({ bgm_volume: Number(e.target.value) })}
          className="w-full"
        />
        <label className="mt-3 flex items-center justify-between text-sm">
          循环播放
          <input
            type="checkbox"
            checked={cfg.bgm_loop ?? true}
            onChange={(e) => updateGlobal({ bgm_loop: e.target.checked })}
          />
        </label>
      </PanelSection>

      <PanelSection title="场景转场" icon={<IconSettings2 size={15} />}>
        <label className="flex items-center justify-between text-sm">
          启用转场
          <input
            type="checkbox"
            checked={(cfg.transition_enabled ?? false) || seg.transition.type !== 'none'}
            onChange={(e) => {
              updateGlobal({ transition_enabled: e.target.checked });
              updateSeg({ transition: { ...seg.transition, type: e.target.checked ? 'fade' : 'none' } });
            }}
          />
        </label>
        <select
          value={seg.transition.type}
          onChange={(e) => updateSeg({ transition: { ...seg.transition, type: e.target.value } })}
          className="mt-3 w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="none">无</option>
          <option value="fade">淡入淡出</option>
          <option value="slideup">上滑</option>
          <option value="zoomin">缩放进入</option>
        </select>
      </PanelSection>

      <PanelSection title="品牌与字幕" icon={<IconType size={15} />}>
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-foreground">品牌套件</div>
              <div className="text-[10px] text-muted-foreground">同步品牌色、背景、字幕和当前场景品牌对象</div>
            </div>
            <span className="text-[10px] text-muted-foreground">{BRAND_KITS.length} 个预设</span>
          </div>
          <div className="grid gap-2">
            {BRAND_KITS.map((kit) => (
              <button
                key={kit.id}
                type="button"
                onClick={() => applyBrandKit(kit)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-left hover:border-foreground/30 hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded border border-border" style={{ backgroundColor: kit.brandColor }} />
                  <span className="text-xs font-medium text-foreground">应用 {kit.name}</span>
                  <span className="ml-auto h-5 w-5 rounded border border-border" style={{ backgroundColor: kit.backgroundColor }} />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">{kit.description}</div>
              </button>
            ))}
          </div>
        </div>
        <label className="block text-xs text-muted-foreground mb-1">品牌色</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={cfg.brand_color || '#4f46e5'}
            onChange={(e) => updateGlobal({ brand_color: e.target.value })}
            className="w-10 h-9 rounded border border-border bg-background"
          />
          <input
            value={cfg.brand_color || '#4f46e5'}
            onChange={(e) => updateGlobal({ brand_color: e.target.value })}
            className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </div>
        <label className="mt-3 block text-xs text-muted-foreground mb-1">Logo 链接</label>
        <FileUploader
          value={cfg.brand_logo_url || ''}
          onChange={(url) => updateGlobal({ brand_logo_url: url })}
          accept="image/*"
          placeholder="品牌 Logo 素材 URL"
          previewType="image"
        />
        <label className="mt-3 block text-xs text-muted-foreground mb-1">字幕样式</label>
        <select
          value={seg.subtitle.style_id}
          onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, style_id: e.target.value } })}
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="default">默认白字底栏</option>
          <option value="bold-yellow">醒目黄字</option>
          <option value="subtitle-card">字幕卡片</option>
          <option value="brand-elegant">品牌优雅</option>
        </select>
      </PanelSection>

      <PanelSection title="输出规格" icon={<IconFilm size={15} />}>
        <label className="block text-xs text-muted-foreground mb-1">画布比例</label>
        <select
          value={cfg.aspect_ratio || '9:16'}
          onChange={(e) => {
            const aspectRatio = e.target.value as NonNullable<DSL['globalConfig']['aspect_ratio']>;
            updateGlobal({ aspect_ratio: aspectRatio, ...getCanvasSizeForAspectRatio(aspectRatio) });
          }}
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="9:16">9:16 竖屏</option>
          <option value="16:9">16:9 横屏</option>
          <option value="1:1">1:1 方形</option>
        </select>
        <label className="mt-3 block text-xs text-muted-foreground mb-1">输出清晰度</label>
        <select
          value={cfg.output_resolution || '1080p'}
          onChange={(e) => updateGlobal({ output_resolution: e.target.value })}
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
          <option value="2K">2K</option>
        </select>
      </PanelSection>
    </div>
  );
}

function ScenePanel({
  dsl,
  currentSegIndex,
  updateDsl,
}: {
  dsl: DSL;
  currentSegIndex: number;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const selectedElement = useEditorStore(s => s.selectedElement);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const issues = getSegmentIssues(seg);
  const updateSeg = (partial: Partial<Segment>) => {
    updateDsl((draft) => {
      const segments = [...draft.segments];
      segments[currentSegIndex] = { ...segments[currentSegIndex], ...partial };
      return { ...draft, segments };
    });
  };

  const addOverlay = () => {
    updateSeg({
      overlays: [
        ...seg.overlays,
        {
          id: `overlay-${Date.now()}`,
          asset_url: '',
          position: { x: 50, y: 50 },
          scale: 100,
          seg_start_time: 0,
          duration: Math.max(1, Number(seg.duration_sec || 5)),
          animation: 'fadeIn',
        },
      ],
    });
    setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: seg.overlays.length });
  };

  return (
    <div className="p-4 space-y-4">
      <PanelSection title="场景状态" icon={<IconAlertCircle size={15} />}>
        {issues.length === 0 ? (
          <div className="rounded-md bg-brand-green/10 text-brand-green px-3 py-2 text-xs flex items-center gap-1">
            <IconCheck size={13} />
            当前场景可用于生成
          </div>
        ) : (
          <div className="space-y-1">
            {issues.map((issue) => (
              <div key={issue} className="rounded-md bg-brand-amber/10 text-brand-amber px-3 py-2 text-xs flex items-center gap-1">
                <IconAlertCircle size={13} />
                {issue}
              </div>
            ))}
          </div>
        )}
      </PanelSection>

      <PanelSection title="场景基础" icon={<IconLayout size={15} />}>
        <label className="block text-xs text-muted-foreground mb-1">场景类型</label>
        <select
          value={seg.type}
          onChange={(e) => updateSeg({ type: e.target.value as Segment['type'] })}
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="narration">口播</option>
          <option value="product">产品</option>
          <option value="scene">场景</option>
          <option value="transition">转场</option>
          <option value="ending">结尾</option>
        </select>
        <label className="mt-3 block text-xs text-muted-foreground mb-1">布局</label>
        <select
          value={seg.layout || 'avatar-center'}
          onChange={(e) => updateSeg({ layout: e.target.value as Segment['layout'] })}
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="avatar-left">数字人靠左</option>
          <option value="avatar-center">数字人居中</option>
          <option value="avatar-right">数字人靠右</option>
          <option value="media-grid">媒体网格</option>
          <option value="full-media">全屏媒体</option>
        </select>
        <NumberField label="场景时长" value={Number(seg.duration_sec || 5)} min={1} max={60} onChange={(value) => updateSeg({ duration_sec: value })} />
      </PanelSection>

      <PanelSection title="画面素材" icon={<IconImage size={15} />}>
        <FileUploader
          label="参考图"
          value={seg.scene_image_url}
          onChange={(url) => updateSeg({ scene_image_url: url, thumbnail_url: url })}
          accept="image/*,video/*"
          placeholder="背景图或参考图 URL"
          previewType="image"
        />
        <label className="mt-3 block text-xs text-muted-foreground mb-1">场景描述</label>
        <textarea
          value={seg.scene_description}
          onChange={(e) => updateSeg({ scene_description: e.target.value })}
          placeholder="用于后续视觉规划 / 图像生成的画面描述"
          className="w-full h-24 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <label className="mt-3 block text-xs text-muted-foreground mb-1">镜头</label>
        <input
          value={seg.camera_shot}
          onChange={(e) => updateSeg({ camera_shot: e.target.value })}
          placeholder="例如中景 / 特写 / 广角"
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        />
      </PanelSection>

      <PanelSection title="数字人与声音" icon={<IconMic size={15} />}>
        <label className="flex items-center justify-between text-sm">
          启用数字人
          <input type="checkbox" checked={seg.digital_human.enabled} onChange={(e) => updateSeg({ digital_human: { ...seg.digital_human, enabled: e.target.checked } })} />
        </label>
        <label className="mt-3 block text-xs text-muted-foreground mb-1">数字人资产 ID</label>
        <input
          value={seg.avatar_id || ''}
          onChange={(e) => updateSeg({ avatar_id: e.target.value })}
          placeholder="数字人 ID"
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        />
        <label className="mt-3 block text-xs text-muted-foreground mb-1">声音 ID</label>
        <input
          value={seg.voice_id || ''}
          onChange={(e) => updateSeg({ voice_id: e.target.value })}
          placeholder="声音 ID"
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        />
      </PanelSection>

      <PanelSection title="字幕与贴片" icon={<IconType size={15} />}>
        <label className="flex items-center justify-between text-sm">
          显示字幕
          <input type="checkbox" checked={seg.subtitle.enabled} onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, enabled: e.target.checked } })} />
        </label>
        <label className="mt-3 block text-xs text-muted-foreground mb-1">字幕位置</label>
        <select
          value={seg.subtitle.position}
          onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, position: e.target.value as Segment['subtitle']['position'] } })}
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="top">顶部</option>
          <option value="center">中间</option>
          <option value="bottom">底部</option>
        </select>
        <label className="mt-3 block text-xs text-muted-foreground mb-1">字幕动画</label>
        <select
          value={seg.subtitle.animation}
          onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, animation: e.target.value as Segment['subtitle']['animation'] } })}
          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="none">无</option>
          <option value="fadeIn">淡入</option>
          <option value="typewriter">打字机</option>
        </select>
        <button
          type="button"
          onClick={addOverlay}
          className="mt-3 w-full h-9 rounded-md bg-secondary text-secondary-foreground hover:bg-accent text-sm flex items-center justify-center gap-1.5"
        >
          <IconPlus size={14} />
          添加贴片层
        </button>
      </PanelSection>

      <PanelSection title="图层" icon={<IconLayout size={15} />}>
        <div className="space-y-1">
          <LayerButton
            active={selectedElement.type === 'scene'}
            label="背景场景"
            meta={seg.scene_image_url || seg.scene_description ? '已配置' : '缺素材'}
            onClick={() => setSelectedElement({ type: 'scene', segIndex: currentSegIndex })}
          />
          <LayerButton
            active={selectedElement.type === 'digital_human'}
            label="数字人"
            meta={seg.digital_human.enabled ? '显示' : '隐藏'}
            onClick={() => setSelectedElement({ type: 'digital_human', segIndex: currentSegIndex })}
          />
          <LayerButton
            active={selectedElement.type === 'subtitle'}
            label="字幕"
            meta={seg.subtitle.enabled ? seg.subtitle.position : '隐藏'}
            onClick={() => setSelectedElement({ type: 'subtitle', segIndex: currentSegIndex })}
          />
          {seg.overlays.map((overlay, index) => (
            <LayerButton
              key={overlay.id}
              active={selectedElement.type === 'overlay' && selectedElement.overlayIndex === index}
              label={`贴片 ${index + 1}`}
              meta={overlay.asset_url ? '素材' : '空贴片'}
              onClick={() => setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: index })}
            />
          ))}
          {(seg.objects || []).map((object, index) => (
            <LayerButton
              key={object.id}
              active={selectedElement.type === 'object' && selectedElement.objectIndex === index}
              label={getObjectLabel(object)}
              meta={object.visible === false ? '隐藏' : object.type}
              onClick={() => setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: index })}
            />
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

function LayerButton({ active, label, meta, onClick }: { active: boolean; label: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
        active ? 'border-foreground bg-accent' : 'border-border hover:border-foreground/30 hover:bg-accent/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium truncate">{label}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">{meta}</span>
      </div>
    </button>
  );
}

function PanelSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-border pb-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function ObjectPanel({
  dsl,
  currentSegIndex,
  selectedElement,
  updateDsl,
}: {
  dsl: DSL;
  currentSegIndex: number;
  selectedElement: CanvasElement;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const updateSeg = (partial: Partial<Segment>) => {
    updateDsl((draft) => {
      const segments = [...draft.segments];
      segments[currentSegIndex] = { ...segments[currentSegIndex], ...partial };
      return { ...draft, segments };
    });
  };

  if (selectedElement.type === 'digital_human') {
    const dh = seg.digital_human;
    return (
      <div className="p-4 space-y-4">
        <PanelSection title="数字人" icon={<IconMic size={15} />}>
          <label className="flex items-center justify-between text-sm">
            显示数字人
            <input type="checkbox" checked={dh.enabled} onChange={(e) => updateSeg({ digital_human: { ...dh, enabled: e.target.checked } })} />
          </label>
          <NumberField label="X 位置" value={dh.position.x} min={0} max={100} onChange={(value) => updateSeg({ digital_human: { ...dh, position: { ...dh.position, x: value } } })} />
          <NumberField label="Y 位置" value={dh.position.y} min={0} max={100} onChange={(value) => updateSeg({ digital_human: { ...dh, position: { ...dh.position, y: value } } })} />
          <NumberField label="缩放" value={dh.scale} min={20} max={220} onChange={(value) => updateSeg({ digital_human: { ...dh, scale: value } })} />
        </PanelSection>
      </div>
    );
  }

  if (selectedElement.type === 'subtitle') {
    return (
      <div className="p-4 space-y-4">
        <PanelSection title="字幕" icon={<IconType size={15} />}>
          <label className="flex items-center justify-between text-sm">
            显示字幕
            <input type="checkbox" checked={seg.subtitle.enabled} onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, enabled: e.target.checked } })} />
          </label>
          <select
            value={seg.subtitle.position}
            onChange={(e) => updateSeg({ subtitle: { ...seg.subtitle, position: e.target.value as Segment['subtitle']['position'] } })}
            className="mt-3 w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="top">顶部</option>
            <option value="center">中间</option>
            <option value="bottom">底部</option>
          </select>
        </PanelSection>
      </div>
    );
  }

  if (selectedElement.type === 'overlay') {
    const overlay = seg.overlays[selectedElement.overlayIndex];
    if (!overlay) return <EmptyObjectState />;
    const updateOverlay = (partial: Partial<typeof overlay>) => {
      const overlays = [...seg.overlays];
      overlays[selectedElement.overlayIndex] = { ...overlay, ...partial };
      updateSeg({ overlays });
    };
    const duplicateOverlay = () => {
      const copy = { ...overlay, id: `overlay-${Date.now()}`, position: { x: Math.min(100, overlay.position.x + 4), y: Math.min(100, overlay.position.y + 4) } };
      const overlays = [...seg.overlays];
      overlays.splice(selectedElement.overlayIndex + 1, 0, copy);
      updateSeg({ overlays });
      setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: selectedElement.overlayIndex + 1 });
    };
    const deleteOverlay = () => {
      const overlays = seg.overlays.filter((_, index) => index !== selectedElement.overlayIndex);
      updateSeg({ overlays });
      setSelectedElement({ type: 'none' });
    };
    return (
      <div className="p-4 space-y-4">
        <PanelSection title="叠加素材" icon={<IconImage size={15} />}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={duplicateOverlay} className="h-8 rounded-md bg-secondary text-secondary-foreground hover:bg-accent text-xs">复制</button>
            <button type="button" onClick={deleteOverlay} className="h-8 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs">删除</button>
          </div>
          <FileUploader
            value={overlay.asset_url}
            onChange={(url) => updateOverlay({ asset_url: url })}
            accept="image/*,video/*"
            placeholder="素材链接"
            previewType="image"
          />
          <NumberField label="X 位置" value={overlay.position.x} min={0} max={100} onChange={(value) => updateOverlay({ position: { ...overlay.position, x: value } })} />
          <NumberField label="Y 位置" value={overlay.position.y} min={0} max={100} onChange={(value) => updateOverlay({ position: { ...overlay.position, y: value } })} />
          <NumberField label="缩放" value={overlay.scale} min={10} max={250} onChange={(value) => updateOverlay({ scale: value })} />
        </PanelSection>
      </div>
    );
  }

  if (selectedElement.type === 'object') {
    const object = seg.objects?.[selectedElement.objectIndex];
    if (!object) return <EmptyObjectState />;
    const updateObject = (partial: Partial<EditorObject>) => {
      const objects = [...(seg.objects || [])];
      objects[selectedElement.objectIndex] = { ...object, ...partial };
      updateSeg({ objects });
    };
    const duplicateObject = () => {
      const objects = [...(seg.objects || [])];
      const copy: EditorObject = {
        ...object,
        id: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: `${object.label || getObjectLabel(object)} 副本`,
        position: { x: Math.min(100, object.position.x + 4), y: Math.min(100, object.position.y + 4) },
      };
      objects.splice(selectedElement.objectIndex + 1, 0, copy);
      updateSeg({ objects });
      setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: selectedElement.objectIndex + 1 });
    };
    const deleteObject = () => {
      const objects = (seg.objects || []).filter((_, index) => index !== selectedElement.objectIndex);
      updateSeg({ objects });
      setSelectedElement({ type: 'none' });
    };
    const moveObject = (direction: -1 | 1) => {
      const objects = [...(seg.objects || [])];
      const nextIndex = selectedElement.objectIndex + direction;
      if (nextIndex < 0 || nextIndex >= objects.length) return;
      const [moved] = objects.splice(selectedElement.objectIndex, 1);
      objects.splice(nextIndex, 0, moved);
      updateSeg({ objects });
      setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: nextIndex });
    };
    return (
      <div className="p-4 space-y-4">
        <PanelSection title={getObjectLabel(object)} icon={<IconLayout size={15} />}>
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            <button type="button" onClick={() => moveObject(-1)} className="h-8 rounded-md bg-secondary text-secondary-foreground hover:bg-accent text-xs">后移</button>
            <button type="button" onClick={() => moveObject(1)} className="h-8 rounded-md bg-secondary text-secondary-foreground hover:bg-accent text-xs">前移</button>
            <button type="button" onClick={duplicateObject} className="h-8 rounded-md bg-secondary text-secondary-foreground hover:bg-accent text-xs">复制</button>
            <button type="button" onClick={deleteObject} className="h-8 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs">删除</button>
          </div>
          <label className="block text-xs text-muted-foreground mb-1">名称</label>
          <input
            value={object.label || ''}
            onChange={(e) => updateObject({ label: e.target.value })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          {(object.type === 'text' || object.type === 'subtitle') && (
            <>
              <label className="mt-3 block text-xs text-muted-foreground mb-1">文字</label>
              <textarea
                value={object.text || ''}
                onChange={(e) => updateObject({ text: e.target.value })}
                className="w-full h-20 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </>
          )}
          {object.type !== 'text' && (
            <>
              <label className="mt-3 block text-xs text-muted-foreground mb-1">素材 URL</label>
              <FileUploader
                value={object.asset_url || ''}
                onChange={(url) => updateObject({ asset_url: url })}
                accept="image/*,video/*"
                placeholder="素材链接"
                previewType="image"
              />
            </>
          )}
          {object.interaction && (
            <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs font-medium text-foreground">互动对象</div>
              <label className="mt-2 block text-xs text-muted-foreground mb-1">类型</label>
              <select
                value={object.interaction.kind}
                onChange={(e) => updateObject({ interaction: { ...object.interaction!, kind: e.target.value as NonNullable<EditorObject['interaction']>['kind'] } })}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="cta_button">按钮</option>
                <option value="branch_menu">分支菜单</option>
                <option value="single_answer">单选</option>
                <option value="multiple_answers">多选</option>
                <option value="score_card">计分卡</option>
              </select>
              <label className="mt-2 block text-xs text-muted-foreground mb-1">目标 URL</label>
              <input
                value={object.interaction.target_url || ''}
                onChange={(e) => updateObject({ interaction: { ...object.interaction!, target_url: e.target.value } })}
                placeholder="https://..."
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              />
              <label className="mt-2 block text-xs text-muted-foreground mb-1">选项</label>
              <textarea
                value={(object.interaction.options || []).join('\n')}
                onChange={(e) => updateObject({ interaction: { ...object.interaction!, options: e.target.value.split('\n').map((value) => value.trim()).filter(Boolean) } })}
                placeholder="每行一个选项"
                className="w-full h-20 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          {object.metadata && (
            <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs font-medium text-foreground">来源状态</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span>来源</span>
                <span className="text-foreground text-right">{
                  !object.metadata.source ? '手动' :
                  object.metadata.source === 'media' ? '媒体' :
                  object.metadata.source === 'motion' ? '动作' :
                  object.metadata.source === 'shape' ? '形状' :
                  object.metadata.source === 'record' ? '录制' :
                  object.metadata.source === 'interactivity' ? '互动' :
                  object.metadata.source
                }</span>
                {object.metadata.duration_sec !== undefined && (
                  <>
                    <span>时长</span>
                    <span className="text-foreground text-right">{object.metadata.duration_sec}s</span>
                  </>
                )}
              </div>
              {object.metadata.note && <p className="mt-2 text-[11px] text-muted-foreground leading-4">{object.metadata.note}</p>}
            </div>
          )}
          <label className="mt-3 flex items-center justify-between text-sm">
            可见
            <button
              type="button"
              onClick={() => updateObject({ visible: object.visible === false })}
              className="w-9 h-8 rounded-md flex items-center justify-center bg-secondary hover:bg-accent"
            >
              {object.visible === false ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            </button>
          </label>
          <NumberField label="X 位置" value={object.position.x} min={0} max={100} onChange={(value) => updateObject({ position: { ...object.position, x: value } })} />
          <NumberField label="Y 位置" value={object.position.y} min={0} max={100} onChange={(value) => updateObject({ position: { ...object.position, y: value } })} />
          <NumberField label="缩放" value={object.scale} min={10} max={260} onChange={(value) => updateObject({ scale: value })} />
          <NumberField label="旋转" value={object.rotation || 0} min={-180} max={180} onChange={(value) => updateObject({ rotation: value })} />
        </PanelSection>
      </div>
    );
  }

  return <EmptyObjectState />;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="mt-3 block text-xs text-muted-foreground">
      <div className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

function EmptyObjectState() {
  return (
    <div className="p-4">
      <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        选择画布中的数字人、字幕或对象后编辑属性
      </div>
    </div>
  );
}

function RenderReviewDialog({
  dsl,
  pipeline,
  inputMode,
  topic,
  scriptText,
  selectedDhId,
  issues,
  ready,
  diagnostics,
  onCancel,
  onConfirm,
  onIssueClick,
}: {
  dsl: DSL;
  pipeline: PipelineOption | undefined;
  inputMode: 'template' | 'topic' | 'script';
  topic: string;
  scriptText: string;
  selectedDhId: string;
  issues: string[];
  ready: boolean;
  diagnostics: ConfigDiagnostics | null;
  onCancel: () => void;
  onConfirm: () => void;
  onIssueClick: (issue: string) => void;
}) {
  const totalDuration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const textCount = dsl.segments.filter(seg => seg.narration_text.trim()).length;
  const sceneCount = dsl.segments.filter(seg => seg.scene_image_url || seg.scene_description).length;
  const brandReady = Boolean(dsl.globalConfig.brand_color || dsl.globalConfig.brand_logo_url);
  const musicEnabled = Boolean(dsl.globalConfig.bgm_enabled || dsl.globalConfig.bgm_url);
  const transitionEnabled = Boolean(dsl.globalConfig.transition_enabled || dsl.segments.some(seg => seg.transition.type !== 'none'));
  const inputLabel = inputMode === 'template' ? '模板片段' : inputMode === 'topic' ? '主题生成' : '固定脚本';
  const inputPreview = inputMode === 'topic' ? topic : inputMode === 'script' ? scriptText : `${dsl.segments.length} 个场景`;
  const pipelineDiagnostics = pipeline ? diagnostics?.pipelines?.[pipeline.key] : undefined;
  const pipelineWarnings = pipelineDiagnostics?.warnings || [];
  const pipelineBlockers = pipelineDiagnostics?.blockers || [];
  const providerKeys = pipelineDiagnostics?.provider_keys || [];
  const activeProviders = diagnostics?.providers?.filter((provider) => providerKeys.includes(provider.key)) || [];
  const estimate = estimateRenderCostRisk(dsl, pipeline, diagnostics);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="render-review-title"
        className="w-[560px] max-w-full bg-card border border-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <h2 id="render-review-title" className="text-base font-semibold text-foreground">生成前复核</h2>
            <p className="text-xs text-muted-foreground mt-1">确认任务参数、素材状态和阻塞项后再提交渲染。</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ReviewMetric label="流水线" value={pipeline?.name || '未选择'} />
            <ReviewMetric label="输入模式" value={inputLabel} />
            <ReviewMetric label="预计时长" value={`${totalDuration}s`} />
            <ReviewMetric label="数字人" value={selectedDhId ? '已选择' : '未选择'} />
            <ReviewMetric label="预计耗时" value={estimate.durationRange} />
            <ReviewMetric label="成本风险" value={estimate.costLabel} />
          </div>
          <div className={`rounded-md border p-3 ${estimate.level === 'high' ? 'border-destructive/30 bg-destructive/10' : estimate.level === 'medium' ? 'border-brand-amber/30 bg-brand-amber/10' : 'border-brand-green/20 bg-brand-green/10'}`}>
            <div className="text-xs font-medium text-foreground mb-1">成本与耗时预估</div>
            <p className="text-xs text-muted-foreground leading-5">
              {estimate.summary}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {estimate.factors.map((factor) => (
                <span key={factor} className="rounded bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">{factor}</span>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-border bg-secondary/50 p-3">
            <div className="text-[11px] text-muted-foreground mb-1">输入摘要</div>
            <p className="text-sm text-foreground line-clamp-3">{inputPreview || '无输入'}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <StatusPill ok={textCount > 0} label={`${textCount}/${dsl.segments.length} 文案`} />
            <StatusPill ok={sceneCount > 0} label={`${sceneCount}/${dsl.segments.length} 场景`} />
            <StatusPill ok={brandReady} label="品牌" />
            <StatusPill ok={musicEnabled} label="音乐" />
            <StatusPill ok={transitionEnabled} label="转场" />
            <StatusPill ok={ready} label={ready ? '可提交' : '有阻塞'} />
          </div>
          {activeProviders.length > 0 && (
            <div className="rounded-md border border-border bg-background p-3">
              <div className="text-[11px] text-muted-foreground mb-2">供应商与运行环境</div>
              <div className="grid grid-cols-2 gap-2">
                {activeProviders.map((provider) => (
                  <div key={provider.key} className="flex items-start gap-2 rounded-md bg-secondary/70 px-2 py-1.5">
                    {provider.configured ? <IconCheck size={13} className="text-brand-green mt-0.5" /> : <IconAlertCircle size={13} className="text-brand-amber mt-0.5" />}
                    <div className="min-w-0">
                      <div className="text-xs text-foreground truncate">{provider.name}</div>
                      <div className="text-[10px] text-muted-foreground">{provider.configured ? '已配置' : '未配置/不可用'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(pipelineBlockers.length > 0 || pipelineWarnings.length > 0) && (
            <div className="rounded-md border border-brand-amber/30 bg-brand-amber/10 p-3">
              <div className="text-xs font-medium text-brand-amber flex items-center gap-1 mb-2">
                <IconAlertCircle size={14} />
                运行风险
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {pipelineBlockers.map((item) => <li key={item} className="text-destructive">{item}</li>)}
                {pipelineWarnings.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {issues.length > 0 && (
            <div className="rounded-md border border-brand-amber/30 bg-brand-amber/10 p-3">
              <div className="text-xs font-medium text-brand-amber flex items-center gap-1 mb-2">
                <IconAlertCircle size={14} />
                需要处理
              </div>
              <ul className="space-y-1">
                {issues.map((issue) => (
                  <li key={issue}>
                    <button
                      type="button"
                      onClick={() => onIssueClick(issue)}
                      className="w-full text-left text-xs text-muted-foreground hover:text-foreground hover:bg-background/70 rounded px-2 py-1 flex items-center justify-between gap-2"
                    >
                      <span>{issue}</span>
                      <span className="text-[10px] text-brand-amber shrink-0">去处理</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onCancel} className="h-9 px-4 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-accent">返回编辑</button>
          <button
            onClick={onConfirm}
            disabled={!ready}
            className="h-9 px-4 text-sm rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <IconZap size={15} />
            提交生成
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium text-foreground truncate">{value}</div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`rounded-md px-2 py-1.5 flex items-center gap-1 ${ok ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-amber/10 text-brand-amber'}`}>
      {ok ? <IconCheck size={13} /> : <IconAlertCircle size={13} />}
      {label}
    </div>
  );
}

function createEditorObject(type: EditorObject['type'], patch: Partial<EditorObject> = {}): EditorObject {
  return {
    id: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: patch.label || getObjectLabel({ type } as EditorObject),
    text: patch.text || '',
    asset_url: patch.asset_url || '',
    interaction: patch.interaction,
    metadata: patch.metadata,
    style: patch.style,
    position: patch.position || { x: 50, y: 48 },
    scale: patch.scale ?? 100,
    rotation: patch.rotation || 0,
    visible: patch.visible ?? true,
    locked: patch.locked ?? false,
  };
}

function getObjectLabel(object: Pick<EditorObject, 'type' | 'label'>) {
  if (object.label) return object.label;
  const labels: Record<EditorObject['type'], string> = {
    text: '文字对象',
    image: '图片对象',
    logo: 'Logo 对象',
    sticker: '贴片对象',
    avatar: '数字人对象',
    subtitle: '字幕对象',
  };
  return labels[object.type];
}

function getCanvasSizeForAspectRatio(aspectRatio: NonNullable<DSL['globalConfig']['aspect_ratio']>) {
  if (aspectRatio === '16:9') return { canvas_width: 1920, canvas_height: 1080 };
  if (aspectRatio === '1:1') return { canvas_width: 1080, canvas_height: 1080 };
  return { canvas_width: 1080, canvas_height: 1920 };
}

function getRenderIssues(
  dsl: DSL,
  pipeline: PipelineOption | undefined,
  selectedDhId: string,
  inputMode: 'template' | 'topic' | 'script',
  topic: string,
  scriptText: string,
  diagnostics: ConfigDiagnostics | null = null,
) {
  const issues: string[] = [];
  if (!pipeline) issues.push('请选择生成流水线');
  if (!dsl.segments.length) issues.push('模板至少需要一个片段');
  if (inputMode === 'template' && !dsl.segments.some(s => s.narration_text.trim())) issues.push('模板模式需要至少一段口播文案');
  if (inputMode === 'topic' && !topic.trim()) issues.push('主题模式需要填写主题');
  if (inputMode === 'script' && !scriptText.trim()) issues.push('固定脚本模式需要填写脚本');
  if (pipeline?.requires_digital_human && !selectedDhId) issues.push('数字人口播流水线需要选择一个就绪数字人');
  if (pipeline?.requires_digital_human && !dsl.segments.some(s => s.digital_human.enabled)) issues.push('数字人口播流水线至少需要一个启用数字人的场景');
  if (dsl.globalConfig.brand_logo_url && !dsl.globalConfig.brand_color) issues.push('已配置 Logo 时建议同时配置品牌色');
  if (pipeline?.key) {
    issues.push(...(diagnostics?.pipelines?.[pipeline.key]?.blockers || []));
  }
  return issues;
}

function estimateRenderCostRisk(
  dsl: DSL,
  pipeline: PipelineOption | undefined,
  diagnostics: ConfigDiagnostics | null,
) {
  const totalDuration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const sceneCount = Math.max(1, dsl.segments.length);
  const outputResolution = dsl.globalConfig.output_resolution || '1080p';
  const aspectRatio = dsl.globalConfig.aspect_ratio || '9:16';
  const pipelineDiagnostics = pipeline ? diagnostics?.pipelines?.[pipeline.key] : undefined;
  const providerWarnings = pipelineDiagnostics?.warnings?.length || 0;
  const providerBlockers = pipelineDiagnostics?.blockers?.length || 0;
  const resolutionMultiplier = outputResolution === '4K' ? 2.1 : outputResolution === '720p' ? 0.75 : 1;
  const pipelineMultiplier = pipeline?.key === 'digital_human' ? 0.85 : 1.25;
  const sceneMultiplier = Math.max(1, sceneCount / 4);
  const complexityScore =
    totalDuration * 0.9 * resolutionMultiplier * pipelineMultiplier +
    sceneCount * 6 * sceneMultiplier +
    providerWarnings * 10 +
    providerBlockers * 25;
  const level: 'low' | 'medium' | 'high' =
    providerBlockers > 0 || complexityScore >= 95 ? 'high' : complexityScore >= 45 ? 'medium' : 'low';
  const minMinutes = Math.max(1, Math.ceil((totalDuration * pipelineMultiplier * resolutionMultiplier + sceneCount * 5) / 45));
  const maxMinutes = Math.max(minMinutes + 1, Math.ceil(minMinutes * (level === 'high' ? 2.4 : level === 'medium' ? 1.8 : 1.4)));
  const costLabel = level === 'high' ? '高成本风险' : level === 'medium' ? '中等成本风险' : '低成本风险';
  const factors = [
    `${sceneCount} 场景`,
    `${totalDuration}s 视频`,
    outputResolution,
    aspectRatio,
    pipeline?.key === 'digital_human' ? '数字人口播' : '场景图+视频生成',
  ];
  if (providerWarnings > 0) factors.push(`${providerWarnings} 项降级风险`);
  if (providerBlockers > 0) factors.push(`${providerBlockers} 项硬阻塞`);
  const summary = `${costLabel}，预计 ${minMinutes}-${maxMinutes} 分钟；${factors.slice(0, 4).join('、')} 是主要驱动因素。`;

  return {
    level,
    costLabel,
    durationRange: `${minMinutes}-${maxMinutes} 分钟`,
    factors,
    summary,
  };
}

type RenderControlProps = {
  dsl: DSL;
  pipelines: PipelineOption[];
  pipelineKey: string;
  setPipelineKey: (key: string) => void;
  inputMode: 'template' | 'topic' | 'script';
  setInputMode: (mode: 'template' | 'topic' | 'script') => void;
  topic: string;
  setTopic: (value: string) => void;
  scriptText: string;
  setScriptText: (value: string) => void;
  selectedDhId: string;
  onRender: () => void;
  diagnostics: ConfigDiagnostics | null;
};

function GeneratePanel({
  dsl,
  pipelines,
  pipelineKey,
  setPipelineKey,
  inputMode,
  setInputMode,
  topic,
  setTopic,
  scriptText,
  setScriptText,
  selectedDhId,
  onRender,
  diagnostics,
}: RenderControlProps) {
  const pipeline = pipelines.find(p => p.key === pipelineKey);
  const issues = getRenderIssues(dsl, pipeline, selectedDhId, inputMode, topic, scriptText, diagnostics);
  const duration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const ready = issues.length === 0;
  const pipelineDiagnostics = pipeline ? diagnostics?.pipelines?.[pipeline.key] : undefined;
  const providerWarnings = pipelineDiagnostics?.warnings || [];
  const providerBlockers = pipelineDiagnostics?.blockers || [];
  const providerStatus = providerBlockers.length > 0
    ? providerBlockers[0]
    : providerWarnings.length > 0
      ? `${providerWarnings.length} 项降级风险`
      : diagnostics
        ? '供应商就绪'
        : '诊断加载中';
  const estimate = estimateRenderCostRisk(dsl, pipeline, diagnostics);

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <IconZap size={16} className="text-brand-blue" />
          <span className="text-sm font-semibold">生成设置</span>
          <span className={`ml-auto text-[11px] flex items-center gap-1 ${ready ? 'text-brand-green' : 'text-brand-amber'}`}>
            {ready ? <IconCheck size={13} /> : <IconAlertCircle size={13} />}
            {ready ? '可生成' : issues[0]}
          </span>
        </div>

        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">流水线</label>
          <select
            value={pipelineKey}
            onChange={(e) => setPipelineKey(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-[12px] outline-none"
          >
            {pipelines.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">{pipeline?.description || '加载流水线...'}</p>
        </div>

        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">输入模式</label>
          <div className="flex rounded-md border border-border overflow-hidden h-9">
            {[
              ['template', '模板'],
              ['topic', '主题'],
              ['script', '脚本'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setInputMode(key as 'template' | 'topic' | 'script')}
                className={`flex-1 text-[12px] ${inputMode === key ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">生成输入</label>
          {inputMode === 'topic' ? (
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="输入主题，后续可接入大语言模型自动拆分分镜"
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-[12px] outline-none"
            />
          ) : inputMode === 'script' ? (
            <input
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="粘贴固定脚本，按行/段落拆分能力后续接入"
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-[12px] outline-none"
            />
          ) : (
            <div className="h-9 rounded-md border border-border bg-secondary px-3 flex items-center gap-2 text-[12px] text-muted-foreground">
              <IconType size={14} />
              使用当前模板中的 {dsl.segments.length} 个片段，预计 {duration}s
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md bg-background border border-border p-2">
            <div className="text-[10px] text-muted-foreground">数字人</div>
            <div className={`font-medium ${selectedDhId ? 'text-brand-green' : 'text-destructive'}`}>{selectedDhId ? '已选择' : '未选择'}</div>
          </div>
          <div className="rounded-md bg-background border border-border p-2">
            <div className="text-[10px] text-muted-foreground">供应商状态</div>
            <div className={`font-medium ${providerBlockers.length > 0 ? 'text-destructive' : providerWarnings.length > 0 ? 'text-brand-amber' : 'text-brand-green'}`}>{providerStatus}</div>
          </div>
          <div className="rounded-md bg-background border border-border p-2">
            <div className="text-[10px] text-muted-foreground">预计成本</div>
            <div className={`font-medium ${estimate.level === 'high' ? 'text-destructive' : estimate.level === 'medium' ? 'text-brand-amber' : 'text-brand-green'}`}>{estimate.costLabel}</div>
          </div>
          <div className="rounded-md bg-background border border-border p-2">
            <div className="text-[10px] text-muted-foreground">预计耗时</div>
            <div className="font-medium text-foreground">{estimate.durationRange}</div>
          </div>
        </div>

        <button
          onClick={onRender}
          disabled={!ready}
          className="w-full h-10 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-md disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed font-medium"
        >
          <IconZap size={15} />
          开始生成
        </button>
      </div>
    </div>
  );
}

function PanelResizer({ onResize }: { onResize: (delta: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const lastX = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    lastX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const delta = e.clientX - lastX.current;
    if (delta !== 0) {
      onResize(delta);
      lastX.current = e.clientX;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`w-1.5 shrink-0 cursor-col-resize transition-colors ${dragging ? 'bg-primary' : 'bg-border hover:bg-primary/60'}`}
    />
  );
}
