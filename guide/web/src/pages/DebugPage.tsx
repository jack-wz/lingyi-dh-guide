import { useState, useEffect, useCallback } from 'react';
import { IconZap, IconPlay, IconSettings, IconMic, IconImage, IconFilm, IconType, IconSave, IconChevronRight } from '../components/Icons';
import IntegratorPlayground from '../components/IntegratorPlayground';

const API_BASE = '/api';

type Tab = 'playground' | 'api' | 'pipeline' | 'prompts' | 'models' | 'ops';

interface LogEntry { time: string; level: 'info' | 'success' | 'error' | 'warn'; msg: string }

interface LlmRuntime {
  configured: boolean;
  source: 'env' | 'config' | 'none';
  base_url: string;
  model: string;
  model_fast: string;
  api_key_masked: string;
  used_for: string[];
  available_models?: string[];
}

interface Config {
  models: {
    kie: {
      base_url: string;
      api_key: string;
      model: string;
      aspect_ratio: string;
      resolution: string;
      poll_timeout: number;
      avatar_model: string;
      avatar_resolution: string;
      avatar_prompt: string;
    };
    yuntts: { base_url: string; api_key: string; default_voice: string; max_audio_duration: number };
    wavespeed: { base_url: string; api_key: string; model: string; resolution: string };
    ffmpeg: { codec: string; preset: string; crf: number; audio_bitrate: string };
    llm: { base_url: string; api_key: string; model: string; model_fast: string };
  };
  llm_runtime?: LlmRuntime;
  prompts: {
    scene_image_default: string;
    human_model: string;
    edge_tts_voice: string;
  };
  pipeline: {
    poll_interval: number;
    tts_speed_threshold: number;
    ken_burns_zoom_start: number;
    ken_burns_zoom_end: number;
    avatar_provider: 'wavespeed' | 'kie';
    timeline_validate: boolean;
    timeline_validate_strict: boolean;
    subtitle_aligner: 'whisper' | 'heuristic';
    whisper_model: string;
  };
}

export default function DebugPage() {
  const [tab, setTab] = useState<Tab>('playground');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const log = (level: LogEntry['level'], msg: string) =>
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), level, msg }]);

  const apiCall = async (method: string, path: string, body?: any) => {
    setLoading(true);
    try {
      const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`${API_BASE}${path}`, opts);
      const data = await res.json();
      log(res.ok ? 'success' : 'error', `${method} ${path} → ${res.status}\n${JSON.stringify(data, null, 2)}`);
      return data;
    } catch (e: any) {
      log('error', `${method} ${path} → ${e.message}`);
    } finally { setLoading(false); }
  };

  const tabs: { id: Tab; label: string; icon: typeof IconZap }[] = [
    { id: 'playground', label: '集成 Playground', icon: IconFilm },
    { id: 'api', label: '接口调试', icon: IconZap },
    { id: 'pipeline', label: '流水线', icon: IconFilm },
    { id: 'prompts', label: '提示词', icon: IconType },
    { id: 'models', label: '模型配置', icon: IconSettings },
    { id: 'ops', label: '运维工具', icon: IconZap },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-[18px] font-medium mb-6 flex items-center gap-2"><IconSettings size={20} /> 调试控制台</h1>

        <div className="flex gap-1 mb-6 bg-secondary/50 p-1 rounded-lg w-fit">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-[14px] rounded-md flex items-center gap-1.5 transition-colors ${
                  tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}>
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {tab === 'playground' && <IntegratorPlayground />}
            {tab === 'api' && <APIPanel apiCall={apiCall} loading={loading} />}
            {tab === 'pipeline' && <PipelinePanel apiCall={apiCall} loading={loading} />}
            {tab === 'prompts' && <PromptsPanel log={log} />}
            {tab === 'models' && <ModelsPanel log={log} />}
            {tab === 'ops' && <OpsPanel apiCall={apiCall} loading={loading} />}
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-[14px] font-medium">响应日志</span>
              <button onClick={() => setLogs([])} className="text-[12px] text-muted-foreground hover:text-foreground">清空</button>
            </div>
            <div className="h-[600px] overflow-y-auto p-3 font-mono text-[12px] space-y-2">
              {logs.length === 0 && <p className="text-muted-foreground text-center py-8">暂无日志</p>}
              {logs.map((l, i) => (
                <div key={i} className={`p-2 rounded-md whitespace-pre-wrap break-all ${
                  l.level === 'success' ? 'bg-brand-green/10 text-brand-green' :
                  l.level === 'error' ? 'bg-destructive/10 text-destructive' :
                  l.level === 'warn' ? 'bg-brand-amber/10 text-brand-amber' :
                  'bg-secondary text-muted-foreground'
                }`}>
                  <span className="opacity-50">[{l.time}]</span> {l.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== API 调试面板 ===== */
function APIPanel({ apiCall, loading }: { apiCall: (m: string, p: string, b?: any) => Promise<any>; loading: boolean }) {
  const [templateId, setTemplateId] = useState('');
  const [dhId, setDhId] = useState('');
  const [renderId, setRenderId] = useState('');

  const endpoints = [
    { group: '健康检查', items: [
      { method: 'GET' as const, path: '/health', label: '检查服务状态' },
    ]},
    { group: '模板管理', items: [
      { method: 'GET' as const, path: '/templates', label: '获取模板列表' },
      { method: 'GET' as const, path: `/templates/${templateId || ':id'}`, label: '获取模板详情', needId: true, idVal: templateId, idSetter: setTemplateId, idPh: '模板 ID' },
      { method: 'POST' as const, path: '/templates', label: '创建模板', body: { name: '调试模板', type: '电商带货' } },
    ]},
    { group: '数字人管理', items: [
      { method: 'GET' as const, path: '/digital-humans', label: '获取数字人列表' },
      { method: 'GET' as const, path: `/digital-humans/${dhId || ':id'}`, label: '获取数字人详情', needId: true, idVal: dhId, idSetter: setDhId, idPh: '数字人 ID' },
    ]},
    { group: '渲染任务', items: [
      { method: 'GET' as const, path: '/renders', label: '获取渲染列表' },
      { method: 'GET' as const, path: `/renders/${renderId || ':id'}`, label: '获取渲染详情', needId: true, idVal: renderId, idSetter: setRenderId, idPh: '渲染 ID' },
    ]},
    { group: '配置管理', items: [
      { method: 'GET' as const, path: '/config', label: '获取当前配置（含 LLM 运行时）' },
      { method: 'GET' as const, path: '/config/diagnostics', label: '供应商诊断（含 LLM）' },
    ]},
  ];

  return (
    <div className="space-y-4">
      {endpoints.map(g => (
        <div key={g.group} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><h3 className="text-[14px] font-medium">{g.group}</h3></div>
          <div className="p-3 space-y-2">
            {g.items.map(ep => (
              <div key={ep.label} className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                  ep.method === 'GET' ? 'bg-brand-green/15 text-brand-green' :
                  ep.method === 'POST' ? 'bg-brand-blue/15 text-brand-blue' :
                  'bg-destructive/15 text-destructive'
                }`}>{ep.method}</span>
                <code className="text-[12px] text-muted-foreground font-mono flex-1 truncate">{ep.path}</code>
                {ep.needId && (
                  <input value={ep.idVal} onChange={e => ep.idSetter(e.target.value)} placeholder={ep.idPh}
                    className="w-32 h-7 text-[12px] bg-secondary border border-border rounded px-2 font-mono" />
                )}
                <button onClick={() => apiCall(ep.method, ep.path, ep.body)} disabled={loading}
                  className="h-7 px-2 text-[12px] bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
                  <IconPlay size={12} /> {ep.label}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== 流水线面板 ===== */
function PipelinePanel({ apiCall, loading }: { apiCall: (m: string, p: string, b?: any) => Promise<any>; loading: boolean }) {
  const [templateId, setTemplateId] = useState('');
  const [dhId, setDhId] = useState('');
  const [variables, setVariables] = useState('{}');

  const stages = [
    { name: '阶段 1', desc: '模板解析 + 变量替换', color: 'brand-blue' },
    { name: '阶段 2', desc: 'KIE 图生图', color: 'brand-purple' },
    { name: '阶段 3', desc: 'TTS + 唇形视频', color: 'brand-green' },
    { name: '阶段 4', desc: 'FFmpeg 组装', color: 'brand-amber' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-[14px] font-medium mb-4">渲染流水线</h3>
        <div className="flex items-center gap-2">
          {stages.map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className="flex-1 p-3 rounded-lg border border-border bg-secondary/30">
                <p className="text-[12px] font-medium">{s.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
              {i < stages.length - 1 && <IconChevronRight size={16} className="text-muted-foreground shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-[14px] font-medium">发起渲染测试</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] text-muted-foreground block mb-1">模板 ID *</label>
            <input value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="输入模板 ID"
              className="w-full h-9 text-[14px] bg-secondary border border-border rounded-md px-3 font-mono" />
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground block mb-1">数字人 ID</label>
            <input value={dhId} onChange={e => setDhId(e.target.value)} placeholder="可选"
              className="w-full h-9 text-[14px] bg-secondary border border-border rounded-md px-3 font-mono" />
          </div>
        </div>
        <div>
          <label className="text-[12px] text-muted-foreground block mb-1">变量（JSON）</label>
          <textarea value={variables} onChange={e => setVariables(e.target.value)} rows={3} placeholder='{"商品名": "智能杯"}'
            className="w-full text-[14px] bg-secondary border border-border rounded-md px-3 py-2 font-mono resize-none" />
        </div>
        <button onClick={() => {
          if (!templateId) return;
          let vars = {}; try { vars = JSON.parse(variables); } catch {}
          apiCall('POST', '/renders', { template_id: templateId, digital_human_id: dhId || undefined, variables: vars });
        }} disabled={loading || !templateId}
          className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 text-[14px] font-medium">
          <IconZap size={16} /> 发起渲染
        </button>
      </div>
    </div>
  );
}

/* ===== 提示词面板 (可编辑) ===== */
function PromptsPanel({ log }: { log: (l: LogEntry['level'], m: string) => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/config`).then(r => r.json()).then(setConfig).catch(() => {});
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      log(res.ok ? 'success' : 'error', `保存提示词 → ${res.status}\n${JSON.stringify(data)}`);
    } catch (e: any) { log('error', `保存失败: ${e.message}`); }
    finally { setSaving(false); }
  };

  if (!config) return <div className="text-muted-foreground py-8 text-center">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-medium">可调提示词</h3>
          <button onClick={save} disabled={saving}
            className="h-8 px-3 text-[12px] bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
            <IconSave size={14} /> {saving ? '保存中...' : '保存'}
          </button>
        </div>
        <div className="space-y-4">
          <Field label="场景图生成默认提示词" value={config.prompts.scene_image_default}
            onChange={v => setConfig({ ...config, prompts: { ...config.prompts, scene_image_default: v } })} rows={3} />
          <Field label="人物形象生成提示词" value={config.prompts.human_model}
            onChange={v => setConfig({ ...config, prompts: { ...config.prompts, human_model: v } })} rows={2} />
          <Field label="Edge TTS 默认声音" value={config.prompts.edge_tts_voice}
            onChange={v => setConfig({ ...config, prompts: { ...config.prompts, edge_tts_voice: v } })} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-[14px] font-medium mb-3">流水线参数</h3>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="轮询间隔 (秒)" value={config.pipeline.poll_interval}
            onChange={v => setConfig({ ...config, pipeline: { ...config.pipeline, poll_interval: v } })} />
          <NumField label="TTS 加速阈值" value={config.pipeline.tts_speed_threshold} step={0.05}
            onChange={v => setConfig({ ...config, pipeline: { ...config.pipeline, tts_speed_threshold: v } })} />
          <NumField label="Ken Burns 起始缩放" value={config.pipeline.ken_burns_zoom_start} step={0.01}
            onChange={v => setConfig({ ...config, pipeline: { ...config.pipeline, ken_burns_zoom_start: v } })} />
          <NumField label="Ken Burns 结束缩放" value={config.pipeline.ken_burns_zoom_end} step={0.01}
            onChange={v => setConfig({ ...config, pipeline: { ...config.pipeline, ken_burns_zoom_end: v } })} />
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input
              type="checkbox"
              checked={config.pipeline.timeline_validate ?? true}
              onChange={e => setConfig({
                ...config,
                pipeline: { ...config.pipeline, timeline_validate: e.target.checked },
              })}
            />
            组装后校验字幕/TTS/贴纸时间轴
          </label>
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input
              type="checkbox"
              checked={config.pipeline.timeline_validate_strict ?? false}
              onChange={e => setConfig({
                ...config,
                pipeline: { ...config.pipeline, timeline_validate_strict: e.target.checked },
              })}
            />
            严格模式（有 warn 也判失败）
          </label>
          <div className="col-span-2">
            <label className="text-[12px] text-muted-foreground block mb-1">字幕对齐</label>
            <select
              value={config.pipeline.subtitle_aligner || 'whisper'}
              onChange={e => setConfig({
                ...config,
                pipeline: { ...config.pipeline, subtitle_aligner: e.target.value as 'whisper' | 'heuristic' },
              })}
              className="w-full h-9 bg-secondary border border-border rounded-md px-2 text-sm"
            >
              <option value="whisper">Whisper（词级 ASR，失败回退启发式）</option>
              <option value="heuristic">启发式（按字数分配时长）</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[12px] text-muted-foreground block mb-1">口型/数字人后端</label>
            <select
              value={config.pipeline.avatar_provider || 'wavespeed'}
              onChange={e => setConfig({
                ...config,
                pipeline: { ...config.pipeline, avatar_provider: e.target.value as 'wavespeed' | 'kie' },
              })}
              className="w-full h-9 bg-secondary border border-border rounded-md px-2 text-sm"
            >
              <option value="wavespeed">WaveSpeed（InfiniteTalk 等，推荐）</option>
              <option value="kie">KIE InfiniteTalk（infinitalk/from-audio）</option>
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              KIE 用于场景图生成；口型视频由本项选择 WaveSpeed 或未来的 KIE 口型 API。
            </p>
          </div>
          <div className="col-span-2">
            <label className="text-[12px] text-muted-foreground block mb-1">Whisper 模型</label>
            <input
              value={config.pipeline.whisper_model || 'base'}
              onChange={e => setConfig({
                ...config,
                pipeline: { ...config.pipeline, whisper_model: e.target.value },
              })}
              className="w-full h-9 bg-secondary border border-border rounded-md px-2 text-sm font-mono"
              placeholder="tiny / base / small"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== 模型配置面板 (可编辑) ===== */
interface AvatarDiagnostics {
  provider: string;
  model: string;
  wavespeed_model: string;
  kie_avatar_model: string;
  resolution: string;
  configured: boolean;
  hint: string;
}

function ModelsPanel({ log }: { log: (l: LogEntry['level'], m: string) => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [avatarDiag, setAvatarDiag] = useState<AvatarDiagnostics | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/config`).then(r => r.json()).then(setConfig).catch(() => {});
    fetch(`${API_BASE}/config/diagnostics`).then(r => r.json()).then(d => setAvatarDiag(d.avatar ?? null)).catch(() => {});
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      log(res.ok ? 'success' : 'error', `保存配置 → ${res.status}\n${JSON.stringify(data)}`);
    } catch (e: any) { log('error', `保存失败: ${e.message}`); }
    finally { setSaving(false); }
  };

  if (!config) return <div className="text-muted-foreground py-8 text-center">加载中...</div>;

  const llmRuntime = config.llm_runtime;
  const llmModel = config.models.llm || {
    base_url: 'https://api.deepseek.com',
    api_key: '',
    model: 'deepseek-v4-pro',
    model_fast: 'deepseek-v4-flash',
  };

  const sections = [
    { key: 'llm', label: 'LLM（DeepSeek 文本润色/脚本）', icon: IconType, fields: [
      { key: 'base_url', label: '基础 URL (https://api.deepseek.com)' },
      { key: 'api_key', label: 'API 密钥', sensitive: true },
      { key: 'model', label: '主模型 (deepseek-v4-pro)' },
      { key: 'model_fast', label: '快速模型 (deepseek-v4-flash)' },
    ]},
    { key: 'kie', label: 'KIE.ai（场景图 + InfiniteTalk 口型）', icon: IconImage, fields: [
      { key: 'base_url', label: '基础 URL' },
      { key: 'api_key', label: 'API 密钥', sensitive: true },
      { key: 'model', label: '场景图模型' },
      { key: 'aspect_ratio', label: '场景宽高比' },
      { key: 'resolution', label: '场景分辨率' },
      { key: 'poll_timeout', label: '轮询超时 (秒)', type: 'number' as const },
      { key: 'avatar_model', label: '口型模型 (infinitalk/from-audio)' },
      { key: 'avatar_resolution', label: '口型分辨率 (480p / 720p)' },
      { key: 'avatar_prompt', label: '口型提示词' },
    ]},
    { key: 'yuntts', label: 'YunTTS 语音合成', icon: IconMic, fields: [
      { key: 'base_url', label: '基础 URL' },
      { key: 'api_key', label: 'API 密钥', sensitive: true },
      { key: 'default_voice', label: '默认声音' },
      { key: 'max_audio_duration', label: '最大音频时长 (秒)', type: 'number' as const },
    ]},
    { key: 'wavespeed', label: 'WaveSpeed 唇形同步', icon: IconFilm, fields: [
      { key: 'base_url', label: '基础 URL' },
      { key: 'api_key', label: 'API 密钥', sensitive: true },
      { key: 'model', label: '口型模型 (infinitetalk / infinitetalk-multi)' },
      { key: 'resolution', label: '分辨率 (480p / 720p)' },
    ]},
    { key: 'ffmpeg', label: 'FFmpeg 编码参数', icon: IconSettings, fields: [
      { key: 'codec', label: '编码器' },
      { key: 'preset', label: '预设' },
      { key: 'crf', label: 'CRF', type: 'number' as const },
      { key: 'audio_bitrate', label: '音频码率' },
    ]},
  ];

  return (
    <div className="space-y-4">
      {avatarDiag && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[14px] font-medium mb-2">口型/数字人运行时</h3>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="text-muted-foreground">后端</div>
            <div className="font-mono">{avatarDiag.provider}</div>
            <div className="text-muted-foreground">口型模型</div>
            <div className="font-mono">{avatarDiag.model}</div>
            <div className="text-muted-foreground">分辨率</div>
            <div className="font-mono">{avatarDiag.resolution}</div>
            <div className="text-muted-foreground">密钥状态</div>
            <div>{avatarDiag.configured ? '已配置' : '未配置'}</div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">{avatarDiag.hint}</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-[14px] font-medium mb-2">LLM 运行时状态</h3>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="text-muted-foreground">生效来源</div>
          <div className="font-mono">{llmRuntime?.source === 'env' ? '环境变量 (LLM_* / OPENAI_*)' : llmRuntime?.source === 'config' ? 'config.json' : '未配置'}</div>
          <div className="text-muted-foreground">主模型</div>
          <div className="font-mono">{llmRuntime?.model || llmModel.model || '—'}</div>
          <div className="text-muted-foreground">快速模型</div>
          <div className="font-mono">{llmRuntime?.model_fast || llmModel.model_fast || '—'}</div>
          <div className="text-muted-foreground">Base URL</div>
          <div className="font-mono truncate">{llmRuntime?.base_url || llmModel.base_url || '—'}</div>
          <div className="text-muted-foreground">密钥</div>
          <div className="font-mono">{llmRuntime?.api_key_masked || (llmModel.api_key ? `${llmModel.api_key.slice(0, 6)}***` : '未设置')}</div>
          <div className="text-muted-foreground">用途</div>
          <div>{(llmRuntime?.used_for || ['润色口播']).join('、')}</div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          环境变量优先于下方 config.json 配置。未配置时「润色本段」回退规则模板。
        </p>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="h-9 px-4 text-[14px] bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 font-medium">
          <IconSave size={16} /> {saving ? '保存中...' : '保存全部配置'}
        </button>
      </div>

      {sections.map(sec => {
        const Icon = sec.icon;
        return (
          <div key={sec.key} className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Icon size={16} className="text-muted-foreground" />
              <h3 className="text-[14px] font-medium">{sec.label}</h3>
            </div>
            <div className="p-4 space-y-3">
              {sec.fields.map(f => {
                const model = config.models[sec.key as keyof typeof config.models] as any;
                return (
                  <div key={f.key}>
                    <label className="text-[12px] text-muted-foreground block mb-1">{f.label}</label>
                    <input
                      type={f.sensitive ? 'password' : f.type === 'number' ? 'number' : 'text'}
                      value={model[f.key] ?? ''}
                      onChange={e => {
                        const val = f.type === 'number' ? Number(e.target.value) : e.target.value;
                        setConfig({ ...config, models: { ...config.models, [sec.key]: { ...model, [f.key]: val } } });
                      }}
                      className="w-full h-9 text-[14px] bg-secondary border border-border rounded-md px-3 font-mono"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== 运维工具面板 ===== */
function OpsPanel({ apiCall, loading }: { apiCall: (m: string, p: string, b?: any) => Promise<any>; loading: boolean }) {
  const [templateId, setTemplateId] = useState('');
  const [jobIds, setJobIds] = useState('');

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-[14px] font-medium">渲染任务审计</h3>
        <p className="text-[12px] text-muted-foreground">扫描 `data/renders/job_*`，输出 TTS/字幕/贴纸时间轴问题清单。</p>
        <button
          onClick={() => apiCall('GET', '/ops/render-audit')}
          disabled={loading}
          className="h-9 px-4 text-[14px] bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
        >
          生成审计报告
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-[14px] font-medium">批量重拼（batch-reassemble）</h3>
        <p className="text-[12px] text-muted-foreground">
          对已有分镜 clip 重新 FFmpeg 组装，跳过 TTS/口型。默认仅处理审计标记为需修复的任务。
        </p>
        <Field label="模板 ID（可选）" value={templateId} onChange={setTemplateId} />
        <Field
          label="指定 Job ID（可选，逗号分隔）"
          value={jobIds}
          onChange={setJobIds}
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => apiCall('POST', '/ops/batch-reassemble', {
              dry_run: true,
              needs_fix: true,
              template_id: templateId || undefined,
              job_ids: jobIds.split(',').map(s => s.trim()).filter(Boolean),
            })}
            disabled={loading}
            className="h-9 px-4 text-[14px] border border-border rounded-md hover:bg-secondary disabled:opacity-50"
          >
            预览（dry-run）
          </button>
          <button
            onClick={() => apiCall('POST', '/ops/batch-reassemble', {
              dry_run: false,
              needs_fix: true,
              template_id: templateId || undefined,
              job_ids: jobIds.split(',').map(s => s.trim()).filter(Boolean),
            })}
            disabled={loading}
            className="h-9 px-4 text-[14px] bg-brand-blue text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
          >
            执行批量重拼
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== 共用组件 ===== */
function Field({ label, value, onChange, rows = 1 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="text-[12px] text-muted-foreground block mb-1">{label}</label>
      {rows > 1 ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
          className="w-full text-[14px] bg-secondary border border-border rounded-md px-3 py-2 resize-none" />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          className="w-full h-9 text-[14px] bg-secondary border border-border rounded-md px-3" />
      )}
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="text-[12px] text-muted-foreground block mb-1">{label}</label>
      <input type="number" value={value} step={step} onChange={e => onChange(Number(e.target.value))}
        className="w-full h-9 text-[14px] bg-secondary border border-border rounded-md px-3 font-mono" />
    </div>
  );
}
