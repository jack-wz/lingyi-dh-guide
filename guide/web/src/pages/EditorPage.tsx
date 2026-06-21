import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import EditorLeftPanel from '../components/EditorLeftPanel';
import { getSegmentIssues } from '../utils/segmentIssues';
import { useEditorStore } from '../store/editorStore';
import type { PipelineOption } from '@shared/data/pipelines';
import { resolveEditorPipelineKey } from '@shared/data/pipelines';
import type {
  ApiSegment,
  CanvasElement,
  ConfigDiagnostics,
  DSL,
  EditorObject,
  Segment,
} from '@shared/types/editor';
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

import ConfirmDialog from '../components/ConfirmDialog';
import { applyVariableSubstitution, buildVariableDefaults } from '../utils/dslNormalize';
import { normalizeSegmentObjects, resolveElementTiming } from '../utils/elementTiming';
import { SUBTITLE_STYLES } from '../data/subtitleStyles';
import {
  resolveSubtitleFontSize,
  SUBTITLE_FONT_SIZE_DEFAULT,
  SUBTITLE_FONT_SIZE_MAX,
  SUBTITLE_FONT_SIZE_MIN,
  resolveSubtitleFontFamily,
} from '@shared/subtitleStyles';
import FontFamilyPicker from '../components/brand-editor/FontFamilyPicker';
import { useFontCatalog } from '../utils/brandFonts';
import { libraryPayloadToBrandPack } from '@shared/brandPack';
import EditorCoachmark from '../components/EditorCoachmark';
import { formatApiErrorMessage, parseApiErrorResponse } from '../utils/apiError';

import { applyBrandLibraryItemToDsl } from '../utils/applyBrandPack';
import HfPipelineStatusBar from '../components/HfPipelineStatusBar';
import BrandLookPresetBanner from '../components/BrandLookPresetBanner';
import { applyLookPresetToDsl, migrateLookPresetPayload, parseLookPresetPayload } from '@shared/lookPreset';
import { createEditorObject, getObjectLabel } from '../utils/editorObjects';
import {
  applyDigitalHumanCatalogToDsl,
  fetchDigitalHumanRecord,
  opentalkingDigitalHumanDefaults,
} from '../utils/digitalHumanCatalog';
import InspectorPanel from './EditorPage/components/InspectorPanel';
import ToolLauncher from './EditorPage/components/ToolLauncher';
import GeneratePanel from './EditorPage/components/panels/GeneratePanel';
import PanelResizer from './EditorPage/components/PanelResizer';
import RenderReviewDialog from './EditorPage/components/RenderReviewDialog';
import UnsavedExitDialog from './EditorPage/components/UnsavedExitDialog';
import { getCanvasSelectionKey } from './EditorPage/utils/canvasSelection';
import {
  getRenderIssues,
  getRenderWarnings,
} from './EditorPage/utils/renderIssues';
import type { InspectorTab, ToolKey } from './EditorPage/types';

export default function EditorPage() {
  usePlaybackLoop();
  const togglePlayback = useEditorStore(s => s.togglePlayback);
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
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
  const [dismissBrandLookBanner, setDismissBrandLookBanner] = useState(false);
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
          subtitle: {
            enabled: seg.subtitle?.enabled ?? true,
            style_id: seg.subtitle?.style_id || 'default',
            position: seg.subtitle?.position || 'bottom',
            animation: seg.subtitle?.animation || 'fadeIn',
            font_size: typeof seg.subtitle?.font_size === 'number' ? seg.subtitle.font_size : undefined,
            font_family: typeof seg.subtitle?.font_family === 'string' ? seg.subtitle.font_family : undefined,
          },
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
      setPipelineKey(resolveEditorPipelineKey(raw.meta?.pipeline_key));
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

  useEffect(() => {
    if (id) localStorage.setItem('guide-last-editor-id', id);
  }, [id]);

  useEffect(() => {
    setDismissBrandLookBanner(false);
  }, [dsl?.globalConfig.brand_pack_id]);

  const appliedDhFromUrlRef = useRef<string | null>(null);
  const appliedBrandFromUrlRef = useRef<string | null>(null);
  const appliedLookFromUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const dhId = searchParams.get('dh_id');
    if (!dhId || loading || !dsl || appliedDhFromUrlRef.current === dhId) return;
    let cancelled = false;
    fetchDigitalHumanRecord(dhId)
      .then((dh) => {
        if (cancelled || !dh?.id) return;
        appliedDhFromUrlRef.current = dhId;
        setSelectedDhId(dh.id);
        updateDsl((draft) => applyDigitalHumanCatalogToDsl(draft, dh));
        setSavingState('dirty');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams, loading, dsl, updateDsl]);

  useEffect(() => {
    if (loading || !dsl || dsl.globalConfig.brand_pack_id) return;
    if (localStorage.getItem('guide-editor-brand-prompted')) return;
    const timer = window.setTimeout(() => {
      setAssetPicker({ open: true, category: 'brand' });
      localStorage.setItem('guide-editor-brand-prompted', '1');
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [loading, dsl?.globalConfig.brand_pack_id]);

  const updateEditorDsl = useCallback((updater: (dsl: DSL) => DSL) => {
    updateDsl(updater);
    setSavingState('dirty');
  }, [updateDsl]);

  useEffect(() => {
    const brandId = searchParams.get('brand_id');
    if (!brandId || loading || !dsl || appliedBrandFromUrlRef.current === brandId) return;
    let cancelled = false;
    fetchLibraryItem(brandId)
      .then((item) => {
        if (cancelled || !item?.id) return;
        appliedBrandFromUrlRef.current = brandId;
        applyBrandLibraryItemToDsl(updateEditorDsl, item, { currentSegIndex });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams, loading, dsl, currentSegIndex, updateEditorDsl]);

  // Explicit "pick brand" from template list "去选用品牌包"
  useEffect(() => {
    if (searchParams.get('pick_brand') !== '1' || loading || !dsl) return;
    if (dsl.globalConfig.brand_pack_id) return;
    // Force open brand picker (bypass the one-time auto prompt guard)
    setAssetPicker({ open: true, category: 'brand' });
  }, [searchParams, loading, dsl]);

  useEffect(() => {
    const lookId = searchParams.get('apply_look');
    if (!lookId || loading || !dsl || appliedLookFromUrlRef.current === lookId) return;
    let cancelled = false;
    fetchLibraryItem(lookId)
      .then((item) => {
        if (cancelled || !item?.id) return;
        const parsed = parseLookPresetPayload(item.payload);
        if (!parsed) return;
        const { payload } = migrateLookPresetPayload(parsed);
        appliedLookFromUrlRef.current = lookId;
        updateEditorDsl((draft) => applyLookPresetToDsl(draft, payload, { currentSegIndex }));
        if (payload.pipeline_required === 'template_editor' || payload.pipeline_required === 'hyperframes_template') {
          setPipelineKey('template_editor');
        }
        setInspectorTab('motion');
        setShowProps(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams, loading, dsl, currentSegIndex, updateEditorDsl]);

  useEffect(() => {
    if (loading || !dsl || dsl.globalConfig.brand_pack_id) return;
    const embeddedName = String(
      (dsl.globalConfig.brand_pack as Record<string, unknown> | undefined)?.name || '',
    ).trim();
    if (!embeddedName) return;
    let cancelled = false;
    fetchLibraryItems({ category: 'brand', limit: 120 })
      .then((items) => {
        if (cancelled) return;
        const match = items.find((item) => item.name.trim() === embeddedName);
        if (match) applyBrandLibraryItemToDsl(updateEditorDsl, match, { currentSegIndex });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loading, dsl?.globalConfig.brand_pack_id, dsl?.globalConfig.brand_pack, currentSegIndex, updateEditorDsl]);

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
          brand_pack_id: dsl.globalConfig.brand_pack_id || undefined,
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
    } else if (selectedElement.type === 'subtitle') {
      setInspectorTab('motion');
      setShowProps(true);
    } else if (
      selectedElement.type === 'object' ||
      selectedElement.type === 'overlay' ||
      selectedElement.type === 'digital_human'
    ) {
      setInspectorTab('object');
    } else if (inspectorTab === 'object' || inspectorTab === 'motion') {
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
    const resolvedDhId = selectedDhId || dsl.meta.digital_human_id || '';
    const body = isAIFullAuto
      ? {
          template_id: id,
          digital_human_id: resolvedDhId,
          topic,
          script_text: scriptText,
          variables: variableValues,
          max_retries: 1,
        }
      : {
          template_id: id,
          digital_human_id: resolvedDhId || undefined,
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
      const body = await parseApiErrorResponse(res);
      setMessageDialog({
        title: '生成失败',
        message: formatApiErrorMessage(body, '无法提交生成任务，请检查任务参数后重试'),
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
      openAssetPicker('digital_human');
      setInspectorTab('layers');
    } else if (issue.includes('品牌') || issue.includes('Logo')) {
      setInspectorTab('design');
    } else if (issue.includes('流水线') || issue.includes('供应商') || issue.includes('主题') || issue.includes('变量')) {
      setActiveTool('generate');
    }
    setShowRenderReview(false);
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
  const renderWarnings = getRenderWarnings(dsl, selectedDhId, pipelineKey);
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
          <div className="flex items-center gap-0.5 mr-1">
            <button
              type="button"
              onClick={() => openAssetPicker('digital_human')}
              className={`h-8 px-2.5 text-[12px] rounded-md flex items-center gap-1 shrink-0 transition-colors border ${
                selectedDhId
                  ? 'border-brand-green/40 bg-brand-green/5 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
              title="选择数字人"
            >
              <IconUser size={14} />
              数字人
              {selectedDhId && <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />}
            </button>
            <button
              type="button"
              onClick={() => openAssetPicker('brand')}
              className={`h-8 px-2.5 text-[12px] rounded-md flex items-center gap-1 shrink-0 transition-colors border ${
                dsl.globalConfig.brand_pack_id
                  ? 'border-brand-blue/40 bg-brand-blue/5 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
              title="选择品牌包"
            >
              <IconPalette size={14} />
              品牌
            </button>
            <button
              type="button"
              onClick={() => openAssetPicker('script', undefined, 'full')}
              className="h-8 px-2.5 text-[12px] rounded-md flex items-center gap-1 shrink-0 transition-colors border border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
              title="从资产库选择脚本"
            >
              <IconType size={14} />
              脚本
            </button>
          </div>
          <div className="w-px h-4 bg-border mx-0.5" />
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
            onEdited={() => setSavingState('dirty')}
            onApplyScript={applyLibraryScriptToSegment}
            onApplyVoice={applyLibraryVoiceToSegment}
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
            title="新标签打开成片预览（与 HyperFrames 导出一致，含变量与 objects）">
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

      {(() => {
        const hasBrand = !!(
          dsl.globalConfig.brand_pack_id ||
          dsl.globalConfig.brand_pack ||
          dsl.globalConfig.brand_color ||
          dsl.globalConfig.brand_logo_url
        );
        return !hasBrand ? (
          <div className="px-4 py-2 bg-brand-amber/10 border-b border-brand-amber/20 text-xs text-muted-foreground shrink-0 flex items-center justify-between gap-3">
            <span>尚未关联资产库品牌包，字幕样式与成片字体可能与预览不一致。</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openAssetPicker('brand')}
                className="text-[11px] px-2.5 py-1 rounded-md bg-brand-blue text-white hover:opacity-90"
              >
                选择品牌包
              </button>
              <Link
                to={`/assets?tab=brand&from=${encodeURIComponent(`/editor/${id}`)}`}
                className="text-brand-blue hover:underline"
              >
                管理
              </Link>
            </div>
          </div>
        ) : null;
      })()}

      <HfPipelineStatusBar
        dsl={dsl}
        pipelineKey={pipelineKey}
        onOpenMotionPanel={() => {
          setInspectorTab('motion');
          setShowProps(true);
        }}
      />

      {!dismissBrandLookBanner && (
        <BrandLookPresetBanner
          dsl={dsl}
          editorId={id || ''}
          onApply={(updater, options) => {
            updateEditorDsl(updater);
            if (options?.pipelineKey) setPipelineKey(options.pipelineKey);
            setInspectorTab('motion');
            setShowProps(true);
          }}
          onDismiss={() => setDismissBrandLookBanner(true)}
        />
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
