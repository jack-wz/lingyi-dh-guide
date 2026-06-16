import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import EditorLeftPanel from '../components/EditorLeftPanel';
import { getSegmentIssues } from '../utils/segmentIssues';
import { useEditorStore } from '../store/editorStore';
import type { CanvasElement, DSL, EditorObject, Segment } from '../store/editorStore';
import VideoCanvas from '../components/VideoCanvas';
import EditorBottomPanel from '../components/EditorBottomPanel';
import AssetPickerModal, { type PickerCategory } from '../components/AssetPickerModal';
import type { LibraryItem } from '../types/library';
import AssetLibrary from '../components/AssetLibrary';
import LayersPanel from '../components/LayersPanel';
import { usePlaybackLoop } from '../hooks/usePlaybackLoop';
import { usePageVisibleRefresh } from '../hooks/usePageVisibleRefresh';
import LibraryQuickList from '../components/LibraryQuickList';
import { assetHubHref, fetchLibraryItem, fetchLibraryItems, libraryBgmItems, libraryTtsItems } from '../utils/libraryApi';
import FileUploader from '../components/FileUploader';
import { IconAlertCircle, IconArrowRight, IconCheck, IconChevronLeft, IconChevronRight, IconClock, IconCopy, IconEye, IconEyeOff, IconFilm, IconGrid, IconImage, IconLayers, IconLayout, IconMic, IconMusic, IconPalette, IconPlus, IconSave, IconSettings2, IconTrash, IconType, IconUpload, IconUser, IconZap } from '../components/Icons';

import { PRESET_TEMPLATES } from '../data/presetTemplates';
import ConfirmDialog from '../components/ConfirmDialog';
import { applyVariableSubstitution, buildVariableDefaults } from '../utils/dslNormalize';
import { normalizeSegmentObjects, resolveElementTiming } from '../utils/elementTiming';
import { SUBTITLE_STYLES } from '../data/subtitleStyles';
import { libraryPayloadToBrandPack } from '@shared/brandPack';
import EditorCoachmark from '../components/EditorCoachmark';

import BrandAssetSelector from '../components/BrandAssetSelector';
import { applyBrandLibraryItemToDsl } from '../utils/applyBrandPack';
import { createEditorObject, getObjectLabel } from '../utils/editorObjects';
import {
  applyDigitalHumanCatalogToDsl,
  fetchDigitalHumanRecord,
  opentalkingDigitalHumanDefaults,
} from '../utils/digitalHumanCatalog';

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

type ToolKey = 'avatar' | 'text' | 'media' | 'generate';
type InspectorTab = 'design' | 'layers' | 'object';

export default function EditorPage() {
  usePlaybackLoop();
  const togglePlayback = useEditorStore(s => s.togglePlayback);
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
  const seekToTime = useEditorStore(s => s.seekToTime);
  const getSegmentStartTime = useEditorStore(s => s.getSegmentStartTime);
  const setPreviewVariables = useEditorStore(s => s.setPreviewVariables);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingState, setSavingState] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [selectedDhId, setSelectedDhId] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
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
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('layers');
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(176);
  const [rightPanelWidth, setRightPanelWidth] = useState(288);
  const [assetPicker, setAssetPicker] = useState<{
    open: boolean;
    category: PickerCategory;
    voiceSubType?: 'tts' | 'bgm';
    scriptMode?: 'full' | 'segment';
  }>({ open: false, category: 'digital_human' });
  const generateSettingsRef = useRef<HTMLDivElement | null>(null);
  const previousSelectionKey = useRef('');
  const pageRefreshTick = usePageVisibleRefresh();

  useEffect(() => {
    setPreviewVariables(variableValues);
  }, [variableValues, setPreviewVariables]);

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
          digital_human: seg.digital_human || opentalkingDigitalHumanDefaults(false),
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
      const initialDhId = raw.meta?.digital_human_id || raw.segments?.find((s: Segment) => s.avatar_id)?.avatar_id || '';
      if (initialDhId) {
        fetchDigitalHumanRecord(initialDhId)
          .then((dh) => {
            if (!dh?.id) return;
            const current = useEditorStore.getState().dsl;
            if (current) setDsl(applyDigitalHumanCatalogToDsl(current, dh));
          })
          .catch(() => {});
      }
      setPipelineKey(raw.meta?.pipeline_key || 'digital_human');
      setInputMode(raw.meta?.input_mode || 'template');
      setTopic(raw.meta?.topic || '');
      setScriptText(raw.meta?.script_text || '');
      setSelectedDhId(raw.meta?.digital_human_id || raw.segments?.find((s: Segment) => s.avatar_id)?.avatar_id || '');
      setVariableValues(buildVariableDefaults(raw));
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

  useEffect(() => {
    if (!pageRefreshTick || !dsl?.globalConfig.brand_pack_id) return;
    const brandId = dsl.globalConfig.brand_pack_id;
    const controller = new AbortController();
    fetchLibraryItem(brandId, controller.signal)
      .then((item) => {
        if (!item?.id) return;
        applyBrandLibraryItemToDsl(updateEditorDsl, item, { currentSegIndex });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [pageRefreshTick, dsl?.globalConfig.brand_pack_id, currentSegIndex, updateEditorDsl]);

  const updateSegmentAt = useCallback((index: number, patch: Partial<Segment>) => {
    updateEditorDsl((draft) => {
      const segments = [...draft.segments];
      segments[index] = { ...segments[index], ...patch };
      return { ...draft, segments };
    });
  }, [updateEditorDsl]);

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
          digital_human_id: selectedDhId || dsl.meta.digital_human_id,
        },
      };
      await fetch(`/api/templates/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dsl_json: dslToSave }),
      });
      setSavingState('saved');
    } catch (e) { console.error(e); setSavingState('dirty'); } finally { setSaving(false); }
  }, [dsl, id, pipelineKey, inputMode, topic, scriptText, selectedDhId]);

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
      if (event.code === 'Space' && !isTextEditing) {
        event.preventDefault();
        togglePlayback();
        return;
      }
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
  }, [redo, saveTemplate, savingState, togglePlayback, undo]);

  useEffect(() => {
    const selectionKey = getCanvasSelectionKey(selectedElement);
    if (previousSelectionKey.current === selectionKey) return;
    previousSelectionKey.current = selectionKey;

    if (selectedElement.type === 'scene') {
      setInspectorTab('layers');
    } else if (
      selectedElement.type === 'object' ||
      selectedElement.type === 'overlay' ||
      selectedElement.type === 'digital_human' ||
      selectedElement.type === 'subtitle'
    ) {
      setInspectorTab('object');
    } else if (inspectorTab === 'object') {
      setInspectorTab('layers');
    }
  }, [inspectorTab, selectedElement]);

  useEffect(() => {
    if (activeTool !== 'generate') return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!generateSettingsRef.current?.contains(event.target as Node)) setActiveTool(null);
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
  }, [activeTool]);

  const applyScriptFromLibrary = (item: LibraryItem) => {
    const content = String(item.payload?.content || '');
    if (!content) return;
    setScriptText(content);
    setInputMode('script');
    if (dsl?.segments.length) {
      updateDsl((draft) => {
        const segments = [...draft.segments];
        segments[0] = { ...segments[0], narration_text: content.split('\n')[0] || segments[0].narration_text };
        return { ...draft, segments };
      });
    }
    setSavingState('dirty');
  };

  const applyLibraryScriptToSegment = (item: LibraryItem) => {
    const content = String(item.payload?.content || '');
    if (!content) return;
    const line = content.split('\n').map((s) => s.trim()).find(Boolean) || content;
    updateSegmentAt(currentSegIndex, { narration_text: line });
    setSavingState('dirty');
  };

  const applyLibraryMediaToSegment = (item: LibraryItem) => {
    if (!item.file_url) return;
    updateSegmentAt(currentSegIndex, {
      scene_image_url: item.file_url,
      thumbnail_url: item.file_url,
    });
    setSavingState('dirty');
  };

  const applyLibraryVoiceToSegment = (item: LibraryItem) => {
    const isBgm = String(item.payload?.kind) === 'bgm';
    if (isBgm && item.file_url) {
      updateSegmentAt(currentSegIndex, { segment_bgm_url: item.file_url });
    } else if (item.payload?.voice_id) {
      updateSegmentAt(currentSegIndex, { voice_id: String(item.payload.voice_id) });
    }
    setSavingState('dirty');
  };

  const applyLibraryBgmToProject = (item: LibraryItem) => {
    if (!item.file_url) return;
    updateEditorDsl((draft) => ({
      ...draft,
      globalConfig: { ...draft.globalConfig, bgm_url: item.file_url, bgm_enabled: true },
    }));
    setSavingState('dirty');
  };

  const openAssetPicker = (
    category: PickerCategory,
    voiceSubType?: 'tts' | 'bgm',
    scriptMode?: 'full' | 'segment',
  ) => {
    setAssetPicker({ open: true, category, voiceSubType, scriptMode });
  };

  const insertFrameShot = useCallback((frameId: string) => {
    if (!dsl) return;
    const pack = dsl.globalConfig.brand_pack
      ? libraryPayloadToBrandPack({
          id: dsl.globalConfig.brand_pack_id || 'inline',
          name: 'brand',
          payload: dsl.globalConfig.brand_pack as Record<string, unknown>,
        })
      : null;
    const frame = pack?.frames.find((f) => f.id === frameId);
    if (!frame) return;
    const defaultScript = String(frame.defaultData?.scriptText || frame.name);
    updateEditorDsl((draft) => {
      const newSeg: Segment = {
        id: `seg_${Date.now()}`,
        type: frame.shotType === 'product_showcase' ? 'product' : frame.shotType === 'closing' ? 'ending' : 'narration',
        narration_text: defaultScript,
        duration_sec: frame.duration,
        scene_image_url: '',
        scene_description: frame.description || frame.name,
        camera_shot: frame.shotType,
        segment_bgm_url: '',
        subtitle: { enabled: true, style_id: (pack?.subtitleStyle || 'default') as Segment['subtitle']['style_id'], position: 'bottom', animation: 'fadeIn' },
        transition: { type: 'fade', duration: 0.5 },
        digital_human: frame.shotType === 'avatar_talking'
          ? opentalkingDigitalHumanDefaults(true)
          : opentalkingDigitalHumanDefaults(false),
        overlays: [],
        layout: frame.shotType === 'product_showcase' ? 'media-grid' : 'avatar-center',
        objects: [],
      };
      const segments = [...draft.segments];
      segments.splice(currentSegIndex + 1, 0, newSeg);
      return {
        ...draft,
        segments,
        meta: { ...draft.meta, frame_template_id: frame.id },
      };
    });
    setCurrentSegIndex(currentSegIndex + 1);
  }, [dsl, currentSegIndex, updateEditorDsl, setCurrentSegIndex]);

  const bindDigitalHuman = (dhId: string) => {
    setSelectedDhId(dhId);
    if (!dsl) return;
    const talkingDefaults = opentalkingDigitalHumanDefaults(true);
    updateDsl((draft) => ({
      ...draft,
      meta: { ...draft.meta, digital_human_id: dhId },
      segments: draft.segments.map((seg) => ({
        ...seg,
        avatar_id: dhId,
        layout: seg.layout || 'avatar-center',
        digital_human: {
          ...talkingDefaults,
          ...seg.digital_human,
          enabled: seg.type === 'narration' ? true : seg.digital_human.enabled,
        },
      })),
    }));
    fetchDigitalHumanRecord(dhId)
      .then((dh) => {
        if (!dh?.id) return;
        const current = useEditorStore.getState().dsl;
        if (current) setDsl(applyDigitalHumanCatalogToDsl(current, dh));
      })
      .catch(() => {});
    setSavingState('dirty');
  };

  const executeRender = async () => {
    if (!dsl) return;
    const selectedPipeline = pipelines.find(p => p.key === pipelineKey);
    const missing = getRenderIssues(dsl, selectedPipeline, selectedDhId, inputMode, topic, scriptText, configDiagnostics, variableValues);
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
          variables: variableValues,
          max_retries: 1,
        }
      : {
          template_id: id,
          digital_human_id: selectedDhId || undefined,
          pipeline_key: pipelineKey,
          input_mode: inputMode,
          topic,
          script_text: scriptText,
          variables: variableValues,
          max_retries: 1,
        };
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const code = err.error_code ? `[${err.error_code}] ` : '';
      setMessageDialog({
        title: '生成失败',
        message: `${code}${err.error || '无法提交生成任务，请检查任务参数后重试。'}`,
        destructive: true,
      });
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
      setInspectorTab('layers');
    } else if (issue.includes('场景')) {
      const index = dsl.segments.findIndex((seg) => !seg.scene_image_url && !seg.scene_description.trim());
      setCurrentSegIndex(index >= 0 ? index : currentSegIndex);
      setInspectorTab('layers');
      setActiveTool('media');
    } else if (issue.includes('数字人')) {
      setActiveTool('avatar');
      setInspectorTab('layers');
    } else if (issue.includes('品牌') || issue.includes('Logo')) {
      setInspectorTab('design');
    } else if (issue.includes('流水线') || issue.includes('供应商') || issue.includes('主题') || issue.includes('变量')) {
      setActiveTool('generate');
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
    digital_human: opentalkingDigitalHumanDefaults(false),
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
    const segDur = Number(dsl.segments[currentSegIndex]?.duration_sec || 5);
    const objectPatch = patch.label || patch.text || patch.asset_url
      ? patch
      : type === 'text'
        ? { label: '文字', text: '新文本' }
        : { label: type === 'logo' ? 'Logo' : '贴片' };
    const object = createEditorObject(type, objectPatch, segDur);
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

  if (loading) return <div className="h-screen flex items-center justify-center bg-background text-muted-foreground">加载中...</div>;
  if (!dsl) return <div className="h-screen flex items-center justify-center bg-background text-muted-foreground">模板不存在</div>;
  const totalDuration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const selectedPipeline = pipelines.find(p => p.key === pipelineKey);
  const renderIssues = getRenderIssues(dsl, selectedPipeline, selectedDhId, inputMode, topic, scriptText, configDiagnostics, variableValues);
  const renderWarnings = getRenderWarnings(dsl);
  const readyToRender = renderIssues.length === 0;
  const segmentItems = dsl.segments.map((seg, index) => ({ seg, index }));

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* 顶部栏 */}
      <div className="relative z-30 flex items-center justify-between gap-2 px-4 bg-card border-b border-border shrink-0 h-11 min-w-0">
        <div className="flex items-center gap-2 min-w-0 shrink">
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
        <div className="flex items-center gap-0.5 shrink-0 min-w-0">
          <button onClick={undo} className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="撤销">
            <IconArrowRight size={16} className="rotate-180" />
          </button>
          <button onClick={redo} className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="重做">
            <IconArrowRight size={16} />
          </button>
          <ToolLauncher
            editorId={id || ''}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            addObject={addObject}
            selectedDhId={selectedDhId}
            onSelectDh={bindDigitalHuman}
            onEdited={() => setSavingState('dirty')}
            onApplyScript={applyLibraryScriptToSegment}
            onApplyVoice={applyLibraryVoiceToSegment}
          />
          <div className="w-px h-4 bg-border mx-0.5" />
          <BrandAssetSelector
            variant="toolbar"
            editorId={id}
            selectedId={dsl.globalConfig.brand_pack_id}
            onSelect={(item) => {
              applyBrandLibraryItemToDsl(updateEditorDsl, item, { currentSegIndex });
              setSavingState('dirty');
            }}
          />
          <Link
            to={`/assets?from=${encodeURIComponent(`/editor/${id}`)}`}
            className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center shrink-0"
            title="资产库"
          >
            <IconGrid size={16} />
          </Link>
          <button
            onClick={() => setShowProps(!showProps)}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${showProps ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
            title="属性面板"
            aria-label="属性面板"
          >
            <IconLayout size={18} />
          </button>
          <button onClick={() => {
              const params = new URLSearchParams({
                variables: JSON.stringify(variableValues),
                input_mode: inputMode,
                topic,
                script_text: scriptText,
              });
              window.open(`/api/hyperframes/${id}/preview-html?${params.toString()}`, '_blank');
            }}
            className="w-9 h-9 rounded-md flex items-center justify-center text-brand-blue hover:bg-brand-blue/10 transition-colors"
            title="HyperFrames 预览（含变量与 objects 合成）">
            <IconFilm size={18} />
          </button>
          <button onClick={saveTemplate} disabled={saving}
            className="h-9 px-3 text-[14px] flex items-center gap-1.5 bg-secondary text-secondary-foreground hover:bg-accent rounded-md transition-colors disabled:opacity-50">
            <IconSave size={16} />
            {saving ? '...' : '保存'}
          </button>
          <div ref={generateSettingsRef} className="relative">
            <button
              onClick={() => setActiveTool(activeTool === 'generate' ? null : 'generate')}
              className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${activeTool === 'generate' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
              title="生成设置"
              aria-label="生成设置"
            >
              <IconSettings2 size={18} />
            </button>
            {activeTool === 'generate' && (
              <div className="absolute right-0 top-full mt-1 z-50 w-[360px] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-2xl">
                <GeneratePanel
                  dsl={dsl}
                  pipelines={pipelines}
                  pipelineKey={pipelineKey}
                  setPipelineKey={setPipelineKey}
                  inputMode={inputMode}
                  setInputMode={setInputMode}
                  topic={topic}
                  setTopic={setTopic}
                  scriptText={scriptText}
                  setScriptText={setScriptText}
                  selectedDhId={selectedDhId}
                  variableValues={variableValues}
                  setVariableValues={setVariableValues}
                  onRender={openRenderReview}
                  diagnostics={configDiagnostics}
                  onOpenPresets={() => { setShowPresets(true); setActiveTool(null); }}
                  editorId={id || ''}
                  onPickScript={() => { openAssetPicker('script', undefined, 'full'); setActiveTool(null); }}
                />
              </div>
            )}
          </div>
          <button onClick={openRenderReview}
            className="h-9 px-4 text-[14px] flex items-center gap-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-md transition-opacity font-medium">
            <IconZap size={16} />
            生成视频
          </button>
        </div>
      </div>

      {!dsl.globalConfig.brand_pack_id && (
        <div className="px-4 py-2 bg-brand-amber/10 border-b border-brand-amber/20 text-xs text-muted-foreground shrink-0 flex items-center justify-between gap-3">
          <span>建议先在顶栏选择品牌包，字幕样式与成片字体将与预览保持一致。</span>
          <Link
            to={`/assets?tab=brand&from=${encodeURIComponent(`/editor/${id}`)}`}
            className="text-brand-blue hover:underline shrink-0"
          >
            前往资产库选品牌
          </Link>
        </div>
      )}

      {/* 主体 */}
      <div className="flex-1 flex overflow-hidden">
        <EditorLeftPanel
          editorId={id || ''}
          style={{ width: leftPanelWidth }}
          dsl={dsl}
          currentSegIndex={currentSegIndex}
          segmentItems={segmentItems}
          totalCount={dsl.segments.length}
          onSelectSegment={setCurrentSegIndex}
          onAddSegment={addSegment}
          onDuplicateSegment={duplicateSegment}
          onDeleteSegment={deleteSegment}
          onMoveUp={(index) => moveSegment(index, index - 1)}
          onMoveDown={(index) => moveSegment(index, index + 1)}
          onReorder={(fromIndex, toIndex) => moveSegment(fromIndex, toIndex)}
        />
        <PanelResizer onResize={(delta) => setLeftPanelWidth(w => Math.max(160, Math.min(320, w + delta)))} />

        {/* 中间：画布 + 底部脚本/时间轴面板（参考 opentalking） */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
          <div className="flex-1 min-h-[180px] overflow-hidden">
            <VideoCanvas />
          </div>
          <EditorBottomPanel
            dsl={dsl}
            currentSegIndex={currentSegIndex}
            variableValues={variableValues}
            editorId={id}
            onSelectScene={(index) => {
              setCurrentSegIndex(index);
              seekToTime(getSegmentStartTime(index), { syncSegment: true, clearSelection: false, stopPlayback: true });
            }}
            onUpdateSegment={updateSegmentAt}
            onPickScript={() => openAssetPicker('script', undefined, 'segment')}
          />
        </div>

        {/* 右侧属性 */}
        {showProps && (
          <>
            <PanelResizer onResize={(delta) => setRightPanelWidth(w => Math.max(240, Math.min(420, w - delta)))} />
            <InspectorPanel
              tab={inspectorTab}
              setTab={setInspectorTab}
              dsl={dsl}
              editorId={id || ''}
              currentSegIndex={currentSegIndex}
              selectedElement={selectedElement}
              updateDsl={updateEditorDsl}
              onInsertFrameShot={insertFrameShot}
              onOpenAssetPicker={openAssetPicker}
              onApplyBgm={applyLibraryBgmToProject}
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
          warnings={renderWarnings}
          ready={readyToRender}
          diagnostics={configDiagnostics}
          onCancel={() => setShowRenderReview(false)}
          onConfirm={executeRender}
          onIssueClick={jumpToRenderIssue}
        />
      )}
      <EditorCoachmark />
      <AssetPickerModal
        open={assetPicker.open}
        category={assetPicker.category}
        voiceSubType={assetPicker.voiceSubType}
        returnTo={id ? `/editor/${id}` : undefined}
        title={
          assetPicker.category === 'digital_human' ? '选择数字人'
            : assetPicker.category === 'brand' ? '选择品牌套件'
            : assetPicker.category === 'script' ? '选择脚本'
            : assetPicker.category === 'media' ? '选择媒体素材'
            : assetPicker.category === 'voice' ? '选择声音'
            : '选择资产'
        }
        selectedId={
          assetPicker.category === 'digital_human'
            ? selectedDhId
            : assetPicker.category === 'brand'
              ? dsl.globalConfig.brand_pack_id
              : undefined
        }
        onClose={() => setAssetPicker((p) => ({ ...p, open: false }))}
        onSelect={(item) => {
          if (assetPicker.category === 'digital_human') bindDigitalHuman(item.id);
          else if (assetPicker.category === 'script') {
            if (assetPicker.scriptMode === 'segment') applyLibraryScriptToSegment(item);
            else applyScriptFromLibrary(item);
          }
          else if (assetPicker.category === 'brand') {
            applyBrandLibraryItemToDsl(updateEditorDsl, item, { currentSegIndex });
            setSavingState('dirty');
          }
          else if (assetPicker.category === 'media') applyLibraryMediaToSegment(item);
          else if (assetPicker.category === 'voice') {
            if (assetPicker.voiceSubType === 'bgm') applyLibraryBgmToProject(item);
            else applyLibraryVoiceToSegment(item);
          }
        }}
      />

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
  editorId,
  activeTool,
  setActiveTool,
  addObject,
  selectedDhId,
  onSelectDh,
  onEdited,
  onApplyScript,
  onApplyVoice,
}: {
  editorId: string;
  activeTool: ToolKey | null;
  setActiveTool: (tool: ToolKey | null) => void;
  addObject: (type: EditorObject['type'], patch?: Partial<EditorObject>) => void;
  selectedDhId: string;
  onSelectDh: (id: string) => void;
  onEdited?: () => void;
  onApplyScript: (item: LibraryItem) => void;
  onApplyVoice: (item: LibraryItem) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tools: Array<{ key: ToolKey; label: string; icon: ReactNode }> = [
    { key: 'avatar', label: '数字人', icon: <IconUser size={17} /> },
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
            {tool.key === 'avatar' && selectedDhId && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand-green ring-1 ring-card" />
            )}
          </button>
        );
      })}
      {activeTool && activeTool !== 'generate' && (
        <ToolPopover
          editorId={editorId}
          tool={activeTool}
          addObject={addObject}
          selectedDhId={selectedDhId}
          onSelectDh={onSelectDh}
          onEdited={onEdited}
          onApplyScript={onApplyScript}
          onApplyVoice={onApplyVoice}
        />
      )}
    </div>
  );
}

function ToolPopover({
  editorId,
  tool,
  addObject,
  selectedDhId,
  onSelectDh,
  onEdited,
  onApplyScript,
  onApplyVoice,
}: {
  editorId: string;
  tool: ToolKey;
  addObject: (type: EditorObject['type'], patch?: Partial<EditorObject>) => void;
  selectedDhId: string;
  onSelectDh: (id: string) => void;
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
    if (tool !== 'text' && tool !== 'avatar') return;
    const controller = new AbortController();
    setLoadingLib(true);
    const category = tool === 'text' ? 'script' : 'voice';
    fetchLibraryItems({ category, limit: 40, signal: controller.signal })
      .then((items) => {
        if (tool === 'text') setScripts(items);
        else setVoices(libraryTtsItems(items));
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (tool === 'text') setScripts([]);
        else setVoices([]);
      })
      .finally(() => setLoadingLib(false));
    return () => controller.abort();
  }, [tool, refreshTick]);

  const hubTab = tool === 'avatar'
    ? 'digital_human'
    : tool === 'text'
      ? 'script'
      : mediaTab === 'sound'
        ? 'voice'
        : 'media';
  const hubHref = assetHubHref(editorId, hubTab);

  return (
    <div className="absolute left-0 top-full mt-1 z-50 w-[340px] rounded-lg border border-border bg-card shadow-2xl p-3 flex flex-col max-h-[min(480px,70vh)]">
      {tool === 'avatar' && (
        <div className="space-y-3 flex flex-col min-h-0 overflow-hidden" style={{ maxHeight: 420 }}>
          <div className="text-xs font-semibold shrink-0">数字人</div>
          <div className="flex-1 min-h-0 -mx-1 overflow-y-auto">
            <AssetLibrary tab="dh" editorId={editorId} selectedDhId={selectedDhId} onSelectDh={onSelectDh} onEdited={onEdited} showSearch={false} />
          </div>
          <div className="shrink-0 border-t border-border pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">配音音色</span>
              <Link to={assetHubHref(editorId, 'voice')} className="text-[10px] text-brand-blue hover:underline">管理</Link>
            </div>
            <LibraryQuickList
              loading={loadingLib}
              emptyHint="暂无音色"
              hubHref={assetHubHref(editorId, 'voice')}
              items={voices}
              renderIcon={() => <IconMic size={14} className="text-muted-foreground" />}
              renderPreview={(item) => String(item.payload?.voice_id || '')}
              onPick={onApplyVoice}
              pickLabel="应用"
              maxItems={5}
            />
          </div>
        </div>
      )}

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

function InspectorPanel({
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
          className={`flex-1 text-sm font-medium ${tab === 'design' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          设计
        </button>
        <button
          onClick={() => setTab('layers')}
          className={`flex-1 text-sm font-medium flex items-center justify-center gap-1 ${tab === 'layers' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <IconLayers size={14} />
          图层
        </button>
        <button
          onClick={() => setTab('object')}
          className={`flex-1 text-sm font-medium ${tab === 'object' ? 'text-foreground border-b-2 border-foreground' : hasObjectSelection ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50'}`}
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
          ) : (
            <ObjectPanel dsl={dsl} currentSegIndex={currentSegIndex} selectedElement={selectedElement} updateDsl={updateDsl} />
          )}
        </div>
      )}
    </aside>
  );
}

function SceneQuickPanel({
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
    </div>
  );
}

function DesignPanel({
  dsl,
  editorId,
  currentSegIndex,
  updateDsl,
  onInsertFrameShot,
  onPickBgm,
  onApplyBgm,
}: {
  dsl: DSL;
  editorId: string;
  currentSegIndex: number;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
  onInsertFrameShot: (frameId: string) => void;
  onPickBgm: () => void;
  onApplyBgm: (item: LibraryItem) => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const cfg = dsl.globalConfig;
  const [framePickerOpen, setFramePickerOpen] = useState(false);

  const activeBrandPack = cfg.brand_pack
    ? { id: cfg.brand_pack_id || 'inline', name: '已应用品牌包', payload: cfg.brand_pack } as LibraryItem
    : null;
  const activePackView = activeBrandPack ? libraryPayloadToBrandPack(activeBrandPack) : null;
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

  return (
    <div className="p-4 space-y-4">
      <p className="text-[11px] text-muted-foreground -mt-1">
        全局样式与输出规格；当前分镜布局与背景图请在「图层」面板调整。
      </p>
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
        <div className="mt-3 flex gap-1.5">
          <button type="button" onClick={onPickBgm} className="flex-1 h-8 rounded-md border border-border bg-background hover:bg-accent text-[11px] text-brand-blue">
            从资产库选 BGM
          </button>
          <Link
            to={`/assets?tab=voice&from=${encodeURIComponent(`/editor/${editorId}`)}`}
            className="h-8 px-2 rounded-md border border-border text-[10px] text-muted-foreground hover:bg-accent flex items-center"
          >
            管理
          </Link>
        </div>
        <BgmQuickPicker onApply={onApplyBgm} />
        <FileUploader
          value={cfg.bgm_url || ''}
          onChange={(url) => updateGlobal({ bgm_url: url, bgm_enabled: Boolean(url) })}
          accept="audio/*"
          placeholder="或粘贴音乐 URL"
          previewType="audio"
          className="mt-2"
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
        <div className="mb-4 space-y-2">
          {activePackView && (
            <p className="text-[10px] text-muted-foreground">
              顶栏已选品牌包 · {activePackView.fontCount} 字体 · {activePackView.frameCount} 镜头
            </p>
          )}
          {activePackView && activePackView.frameCount > 0 && (
            <div>
              <button type="button" onClick={() => setFramePickerOpen((v) => !v)} className="text-[10px] text-brand-blue hover:underline">
                从品牌包添加镜头
              </button>
              {framePickerOpen && (
                <div className="mt-2 max-h-36 overflow-y-auto space-y-1 border border-border rounded-md p-2">
                  {activePackView.frames.map((f) => (
                    <button key={f.id} type="button" onClick={() => { onInsertFrameShot(f.id); setFramePickerOpen(false); }}
                      className="w-full text-left text-[10px] px-2 py-1.5 rounded hover:bg-accent">
                      {f.name} <span className="text-muted-foreground">({f.duration}s)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
          {SUBTITLE_STYLES.map((style) => (
            <option key={style.id} value={style.id}>{style.name}</option>
          ))}
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
          <label className="block text-xs text-muted-foreground mb-1">开始时间 (s)</label>
          <input
            type="number"
            min={0}
            max={seg.duration_sec}
            step={0.1}
            value={overlay.seg_start_time}
            onChange={(e) => updateOverlay({ seg_start_time: Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <label className="mt-3 block text-xs text-muted-foreground mb-1">持续时长 (s)</label>
          <input
            type="number"
            min={0.1}
            max={seg.duration_sec}
            step={0.1}
            value={overlay.duration}
            onChange={(e) => updateOverlay({ duration: Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <label className="mt-3 block text-xs text-muted-foreground mb-1">入场动画</label>
          <select
            value={overlay.animation}
            onChange={(e) => updateOverlay({ animation: e.target.value as typeof overlay.animation })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="none">无</option>
            <option value="fadeIn">淡入</option>
            <option value="scaleIn">缩放</option>
          </select>
          <NumberField label="X 位置" value={overlay.position.x} min={0} max={100} onChange={(value) => updateOverlay({ position: { ...overlay.position, x: value } })} />
          <NumberField label="Y 位置" value={overlay.position.y} min={0} max={100} onChange={(value) => updateOverlay({ position: { ...overlay.position, y: value } })} />
          <NumberField label="缩放" value={overlay.scale} min={10} max={250} onChange={(value) => updateOverlay({ scale: value })} />
          <NumberField label="宽度 %" value={overlay.render_width_pct ?? 20} min={5} max={100} onChange={(value) => updateOverlay({ render_width_pct: value })} />
          <NumberField label="高度 %" value={overlay.render_height_pct ?? 12} min={5} max={100} onChange={(value) => updateOverlay({ render_height_pct: value })} />
        </PanelSection>
      </div>
    );
  }

  if (selectedElement.type === 'object') {
    const object = seg.objects?.[selectedElement.objectIndex];
    if (!object) return <EmptyObjectState />;
    const brandPackPayload = dsl.globalConfig.brand_pack as { tokens?: { typography?: { fonts?: Array<{ name: string; family: string }> } } } | undefined;
    const brandFonts = brandPackPayload?.tokens?.typography?.fonts || [];
    const defaultFont = dsl.globalConfig.default_font_family || 'sans-serif';
    const segDur = Number(seg.duration_sec || 5);
    const objectTiming = resolveElementTiming(object, segDur);
    const updateObject = (partial: Partial<EditorObject>) => {
      const objects = [...(seg.objects || [])];
      objects[selectedElement.objectIndex] = { ...object, ...partial };
      updateSeg({ objects });
    };
    const updateObjectStyle = (partial: NonNullable<EditorObject['style']>) => {
      updateObject({ style: { ...object.style, ...partial } });
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
              <label className="mt-3 block text-xs text-muted-foreground mb-1">文字样式预设</label>
              <select
                value={object.style?.variant || 'custom'}
                onChange={(e) => {
                  const style = SUBTITLE_STYLES.find((item) => item.id === e.target.value);
                  if (!style) return;
                  updateObject({
                    style: {
                      ...object.style,
                      variant: style.id,
                      textColor: style.preview.color,
                      background: style.preview.bg === 'transparent' ? 'transparent' : style.preview.bg,
                      fill: style.preview.bg === 'transparent' ? undefined : style.preview.bg,
                      outline: style.preview.outline,
                      fontSize: style.preview.fontSize,
                      fontWeight: style.preview.fontWeight,
                      borderRadius: style.preview.borderRadius ?? 8,
                    },
                  });
                }}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="custom">自定义</option>
                {SUBTITLE_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>{style.name}</option>
                ))}
              </select>
              <NumberField label="字号" value={object.style?.fontSize ?? 16} min={10} max={48} onChange={(value) => updateObjectStyle({ fontSize: value })} />
              <NumberField label="字重" value={object.style?.fontWeight ?? 500} min={300} max={900} onChange={(value) => updateObjectStyle({ fontWeight: value })} />
              <label className="mt-3 block text-xs text-muted-foreground mb-1">字体</label>
              <select
                value={object.style?.fontFamily || defaultFont}
                onChange={(e) => updateObjectStyle({ fontFamily: e.target.value })}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                {brandFonts.length > 0 ? brandFonts.map((f) => (
                  <option key={f.family} value={f.family}>{f.name}</option>
                )) : (
                  <>
                    <option value={defaultFont}>品牌默认</option>
                    <option value="sans-serif">无衬线</option>
                    <option value="serif">衬线</option>
                  </>
                )}
              </select>
              <label className="mt-3 block text-xs text-muted-foreground mb-1">文字颜色</label>
              <div className="flex items-center gap-2">
                <input type="color" value={object.style?.textColor || '#111827'} onChange={(e) => updateObjectStyle({ textColor: e.target.value })} className="w-10 h-9 rounded border border-border bg-background" />
                <input value={object.style?.textColor || '#111827'} onChange={(e) => updateObjectStyle({ textColor: e.target.value })} className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm" />
              </div>
              <label className="mt-3 block text-xs text-muted-foreground mb-1">背景色</label>
              <div className="flex items-center gap-2">
                <input type="color" value={object.style?.background?.startsWith('#') ? object.style.background : '#ffffff'} onChange={(e) => updateObjectStyle({ background: e.target.value, fill: e.target.value })} className="w-10 h-9 rounded border border-border bg-background" />
                <button type="button" onClick={() => updateObjectStyle({ background: 'transparent', fill: undefined })} className="h-9 px-3 rounded-md bg-secondary text-xs">透明</button>
              </div>
            </>
          )}
          <label className="mt-3 block text-xs text-muted-foreground mb-1">开始时间 (s)</label>
          <input
            type="number"
            min={0}
            max={segDur}
            step={0.1}
            value={objectTiming.start}
            onChange={(e) => updateObject({ seg_start_time: Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <label className="mt-3 block text-xs text-muted-foreground mb-1">持续时长 (s)</label>
          <input
            type="number"
            min={0.1}
            max={segDur}
            step={0.1}
            value={objectTiming.duration}
            onChange={(e) => updateObject({ duration: Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <label className="mt-3 block text-xs text-muted-foreground mb-1">入场动画</label>
          <select
            value={object.animation || 'none'}
            onChange={(e) => updateObject({ animation: e.target.value as EditorObject['animation'] })}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="none">无</option>
            <option value="fadeIn">淡入</option>
            <option value="scaleIn">缩放</option>
          </select>
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
  warnings = [],
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
  warnings?: string[];
  ready: boolean;
  diagnostics: ConfigDiagnostics | null;
  onCancel: () => void;
  onConfirm: () => void;
  onIssueClick: (issue: string) => void;
}) {
  const totalDuration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const textCount = dsl.segments.filter(seg => seg.narration_text.trim()).length;
  const sceneCount = dsl.segments.filter(seg => seg.scene_image_url || seg.scene_description).length;
  const brandReady = Boolean(dsl.globalConfig.brand_pack_id || dsl.globalConfig.brand_color || dsl.globalConfig.brand_logo_url);
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
            <StatusPill ok={brandReady} label={dsl.globalConfig.brand_pack_id ? '品牌包' : '品牌'} />
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
          {warnings && warnings.length > 0 && (
            <div className="rounded-md border border-border bg-secondary/50 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">建议项（不阻塞提交）</div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {warnings.map((w) => <li key={w}>{w}</li>)}
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

function getCanvasSizeForAspectRatio(aspectRatio: NonNullable<DSL['globalConfig']['aspect_ratio']>) {
  if (aspectRatio === '16:9') return { canvas_width: 1920, canvas_height: 1080 };
  if (aspectRatio === '1:1') return { canvas_width: 1080, canvas_height: 1080 };
  return { canvas_width: 1080, canvas_height: 1920 };
}

function getRenderWarnings(dsl: DSL): string[] {
  const warnings: string[] = [];
  if (!dsl.globalConfig.brand_pack_id) {
    warnings.push('未选择品牌包（建议先选，确保字幕样式与成片字体一致）');
  }
  return warnings;
}

function getRenderIssues(
  dsl: DSL,
  pipeline: PipelineOption | undefined,
  selectedDhId: string,
  inputMode: 'template' | 'topic' | 'script',
  topic: string,
  scriptText: string,
  diagnostics: ConfigDiagnostics | null = null,
  variableValues: Record<string, string> = {},
) {
  const issues: string[] = [];
  if (!pipeline) issues.push('请选择生成流水线');
  if (!dsl.segments.length) issues.push('模板至少需要一个片段');
  if (inputMode === 'template' && !dsl.segments.some(s => s.narration_text.trim())) issues.push('模板模式需要至少一段口播文案');
  if (inputMode === 'topic' && !topic.trim()) issues.push('主题模式需要填写主题');
  if (inputMode === 'script' && !scriptText.trim()) issues.push('固定脚本模式需要填写脚本');
  for (const v of dsl.variables || []) {
    if (v.required && !String(variableValues[v.name] ?? '').trim()) {
      issues.push(`请填写变量：${v.label || v.name}`);
    }
  }
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
  editorId?: string;
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
  variableValues: Record<string, string>;
  setVariableValues: (values: Record<string, string>) => void;
  onRender: () => void;
  diagnostics: ConfigDiagnostics | null;
  onOpenPresets?: () => void;
  onPickScript?: () => void;
};

function GeneratePanel({
  dsl,
  editorId,
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
  variableValues,
  setVariableValues,
  onRender,
  diagnostics,
  onOpenPresets,
  onPickScript,
}: RenderControlProps) {
  const pipeline = pipelines.find(p => p.key === pipelineKey);
  const issues = getRenderIssues(dsl, pipeline, selectedDhId, inputMode, topic, scriptText, diagnostics, variableValues);
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

        {(dsl.variables?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <label className="block text-[10px] text-muted-foreground">模板变量</label>
            {dsl.variables!.map((v) => (
              <div key={v.name}>
                <label className="block text-[10px] text-muted-foreground mb-0.5">
                  {v.label || v.name}{v.required ? ' *' : ''}
                </label>
                <input
                  value={variableValues[v.name] ?? ''}
                  onChange={(e) => setVariableValues({ ...variableValues, [v.name]: e.target.value })}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-[12px] outline-none"
                  placeholder={v.example_value || v.description}
                />
              </div>
            ))}
          </div>
        )}

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

        <div className="flex flex-wrap gap-2">
          {onPickScript && (
            <button type="button" onClick={onPickScript} className="text-[11px] text-brand-blue hover:underline">
              从资产库选脚本
            </button>
          )}
          {onOpenPresets && (
            <button type="button" onClick={onOpenPresets} className="text-[11px] text-brand-blue hover:underline">
              预置模板
            </button>
          )}
          <Link
            to={editorId ? `/assets?from=${encodeURIComponent(`/editor/${editorId}`)}` : '/assets'}
            className="text-[11px] text-brand-blue hover:underline no-underline"
          >
            资产库
          </Link>
        </div>
        <p className="text-[10px] text-muted-foreground leading-5 rounded-md border border-dashed border-border px-3 py-2">
          配置完成后，点击「生成视频」进入复核并提交。
        </p>
      </div>
    </div>
  );
}

function BgmQuickPicker({ onApply }: { onApply: (item: LibraryItem) => void }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const refreshTick = usePageVisibleRefresh();

  useEffect(() => {
    fetchLibraryItems({ category: 'voice', limit: 40 })
      .then((all) => setItems(libraryBgmItems(all).slice(0, 6)))
      .catch(() => setItems([]));
  }, [refreshTick]);

  if (items.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onApply(item)}
          className="px-2 py-1 rounded border border-border text-[9px] truncate max-w-[130px] hover:bg-accent"
          title={item.name}
        >
          {item.name}
        </button>
      ))}
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
