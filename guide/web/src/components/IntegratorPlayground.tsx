import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconFilm, IconZap } from './Icons';
import { DEFAULT_SMOKE_TEMPLATE_ID } from '../constants/integrator';
import { formatApiErrorMessage, parseApiErrorResponse } from '../utils/apiError';
import { showApiToast } from './ApiToast';

type HealthState = 'checking' | 'ok' | 'down';
type SmokePhase = 'idle' | 'submitting' | 'polling' | 'completed' | 'failed';

interface Diagnostics {
  providers?: Array<{ key: string; name: string; configured: boolean }>;
  pipelines?: Record<string, { blockers: string[]; warnings: string[] }>;
}

interface RenderJob {
  id: string;
  status: string;
  stage: string;
  progress: number;
  output_url?: string;
  error_message?: string;
  error_code?: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  queued: '排队中',
  parsing: '解析模板',
  scene_gen: '场景图',
  video_gen: '分镜视频',
  ffmpeg: '合成',
  completed: '完成',
  failed: '失败',
};

export default function IntegratorPlayground() {
  const [health, setHealth] = useState<HealthState>('checking');
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [templateId, setTemplateId] = useState(DEFAULT_SMOKE_TEMPLATE_ID);
  const [phase, setPhase] = useState<SmokePhase>('idle');
  const [job, setJob] = useState<RenderJob | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const loadStatus = useCallback(async () => {
    setHealth('checking');
    try {
      const [guideRes, directRes, diagRes] = await Promise.all([
        fetch('/api/guide/health'),
        fetch('/api/health'),
        fetch('/api/config/diagnostics'),
      ]);
      setHealth(guideRes.ok || directRes.ok ? 'ok' : 'down');
      if (diagRes.ok) {
        setDiagnostics(await diagRes.json());
      }
    } catch {
      setHealth('down');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadStatus]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollJob = (jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/renders/${jobId}`);
        const data = (await res.json()) as RenderJob;
        setJob(data);
        if (data.status === 'completed') {
          stopPolling();
          setPhase('completed');
          if (startedAtRef.current != null) {
            setElapsedSec(Math.round((performance.now() - startedAtRef.current) / 100) / 10);
          }
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          stopPolling();
          setPhase('failed');
          showApiToast(
            formatApiErrorMessage(
              { error: data.error_message || data.status, error_code: data.error_code ?? undefined },
              '渲染失败',
            ),
            { destructive: true },
          );
        }
      } catch (e) {
        stopPolling();
        setPhase('failed');
        showApiToast(e instanceof Error ? e.message : '轮询失败', { destructive: true });
      }
    }, 3000);
  };

  const runSmoke = async (submitOnly: boolean) => {
    setPhase('submitting');
    setJob(null);
    setElapsedSec(null);
    startedAtRef.current = performance.now();

    try {
      const res = await fetch('/api/renders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId.trim(),
          pipeline_key: 'template_editor',
          input_mode: 'template',
        }),
      });
      if (!res.ok) {
        const body = await parseApiErrorResponse(res);
        throw new Error(formatApiErrorMessage(body, '提交渲染失败'));
      }
      const created = (await res.json()) as RenderJob;
      setJob(created);
      if (submitOnly) {
        setPhase('idle');
        setElapsedSec(Math.round((performance.now() - startedAtRef.current) / 100) / 10);
        showApiToast(`任务已入队：${created.id}`);
        return;
      }
      setPhase('polling');
      pollJob(created.id);
    } catch (e) {
      setPhase('failed');
      showApiToast(e instanceof Error ? e.message : '提交失败', { destructive: true });
    }
  };

  const blockers = diagnostics?.pipelines?.standard?.blockers ?? [];
  const warnings = diagnostics?.pipelines?.standard?.warnings ?? [];
  const providers = diagnostics?.providers ?? [];

  return (
    <div className="space-y-4" data-testid="integrator-playground">
      <div className="bg-gradient-to-br from-brand-blue/10 via-card to-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-medium flex items-center gap-2">
              <IconZap size={18} className="text-brand-blue" />
              集成方 Playground
            </h2>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-xl">
              浏览器内一键验证「模板 → 渲染 → 成片」，对标 HeyGen Playground。CLI 等价：
              <code className="mx-1 text-[11px] bg-secondary px-1 rounded">make smoke-integrator</code>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="h-8 px-3 text-[12px] border border-border rounded-md hover:bg-secondary"
          >
            刷新状态
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          <span
            className={`px-2 py-1 rounded-full ${
              health === 'ok' ? 'bg-brand-green/15 text-brand-green' : health === 'down' ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-muted-foreground'
            }`}
          >
            API {health === 'ok' ? '在线' : health === 'down' ? '离线' : '检测中…'}
          </span>
          {providers.map((p) => (
            <span
              key={p.key}
              className={`px-2 py-1 rounded-full ${p.configured ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-amber/10 text-brand-amber'}`}
            >
              {p.name}: {p.configured ? '已配置' : '未配置'}
            </span>
          ))}
        </div>

        {blockers.length > 0 && (
          <p className="mt-3 text-[12px] text-destructive">阻塞：{blockers.join('；')}</p>
        )}
        {warnings.length > 0 && (
          <p className="mt-1 text-[12px] text-brand-amber">警告：{warnings.join('；')}</p>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div>
          <label className="text-[12px] text-muted-foreground block mb-1">Smoke 模板 ID</label>
          <input
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full h-9 text-[13px] font-mono bg-secondary border border-border rounded-md px-3"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={phase === 'submitting' || phase === 'polling' || health !== 'ok' || blockers.length > 0}
            onClick={() => void runSmoke(false)}
            className="h-10 px-5 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-2 text-[14px] font-medium"
            data-testid="playground-smoke-run"
          >
            <IconFilm size={16} />
            {phase === 'polling' ? '渲染中…' : '一键 Smoke 渲染'}
          </button>
          <button
            type="button"
            disabled={phase === 'submitting' || phase === 'polling' || health !== 'ok'}
            onClick={() => void runSmoke(true)}
            className="h-10 px-4 border border-border rounded-md hover:bg-secondary disabled:opacity-50 text-[13px]"
            data-testid="playground-submit-only"
          >
            仅入队（不等待成片）
          </button>
        </div>

        {job && (
          <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <span className="font-mono text-muted-foreground">Job: {job.id}</span>
              {elapsedSec != null && (
                <span className="tabular-nums text-brand-blue font-medium">TTHW_ELAPSED_SEC={elapsedSec}</span>
              )}
              <Link to={`/render/${job.id}`} className="text-brand-blue hover:underline">
                打开渲染详情 →
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-blue transition-all duration-500"
                  style={{ width: `${Math.min(100, job.progress ?? 0)}%` }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums w-24 text-right">
                {STAGE_LABELS[job.stage] || job.stage} · {job.progress ?? 0}%
              </span>
            </div>

            {phase === 'completed' && job.output_url && (
              <div className="space-y-2">
                <p className="text-[12px] text-brand-green font-medium">魔法时刻：成片已生成</p>
                <video
                  src={job.output_url}
                  controls
                  className="w-full max-h-[360px] rounded-lg bg-black"
                  data-testid="playground-output-video"
                />
                <a href={job.output_url} target="_blank" rel="noreferrer" className="text-[12px] text-brand-blue hover:underline">
                  新标签页打开 MP4
                </a>
              </div>
            )}

            {phase === 'failed' && job.error_message && (
              <p className="text-[12px] text-destructive whitespace-pre-wrap">{job.error_message}</p>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        文档：
        <a
          href="https://github.com/AIDC-AI/Pixelle-Video/blob/main/guide/docs/INTEGRATOR_QUICKSTART.md"
          target="_blank"
          rel="noreferrer"
          className="text-brand-blue hover:underline ml-1"
        >
          INTEGRATOR_QUICKSTART
        </a>
        {' · '}
        <button type="button" className="text-brand-blue hover:underline" onClick={() => apiCallDocs()}>
          错误码目录
        </button>
      </p>
    </div>
  );
}

async function apiCallDocs() {
  try {
    const res = await fetch('/api/error-catalog');
    const data = await res.json();
    console.info('error-catalog', data);
    showApiToast('错误码目录已输出到浏览器控制台（F12）');
  } catch {
    showApiToast('无法加载错误码目录', { destructive: true });
  }
}