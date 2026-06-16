import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog';

interface RenderJob {
  id: string;
  template_id: string;
  digital_human_id: string;
  status: string;
  pipeline_key: string;
  input_mode: string;
  retry_count: number;
  max_retries: number;
  worker_id: string;
  heartbeat_at: string;
  variables_json: string;
  output_url: string;
  output_exists: boolean;
  error_message: string;
  error_code?: string | null;
  progress: number;
  stage: string;
  created_at: string;
  completed_at: string;
}

interface LogEntry {
  id: number;
  level: string;
  message: string;
  created_at: string;
}

const stageLabels: Record<string, string> = {
  queued: '等待中',
  parsing: '解析模板',
  scene_gen: '生成场景图',
  video_gen: '生成分镜视频',
  ffmpeg: '组装视频',
  completed: '完成',
  failed: '失败',
  cancelling: '取消中',
  cancelled: '已取消',
};

export default function RenderResultPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<RenderJob | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [messageDialog, setMessageDialog] = useState<{ title: string; message: string; destructive?: boolean } | null>(null);
  const [reassembling, setReassembling] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const lastLogIdRef = useRef(0);

  useEffect(() => {
    if (!id) return;
    const fetchJob = async () => {
      try {
        const res = await fetch(`/api/renders/${id}`);
        setJob(await res.json());
      } catch (e) {
        console.error('Failed to fetch render job', e);
      }
    };
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/renders/${id}/logs?after=${lastLogIdRef.current}`);
        const newLogs: LogEntry[] = await res.json();
        if (newLogs.length > 0) {
          setLogs(prev => {
            const seen = new Set(prev.map((log) => log.id));
            const deduped = newLogs.filter((log) => !seen.has(log.id));
            return deduped.length > 0 ? [...prev, ...deduped] : prev;
          });
          lastLogIdRef.current = newLogs[newLogs.length - 1].id;
        }
      } catch (e) {
        console.error('Failed to fetch logs', e);
      }
    };
    fetchJob();
    fetchLogs();
    const interval = setInterval(() => { fetchJob(); fetchLogs(); }, 2000);
    return () => clearInterval(interval);
  }, [id]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!job) return <div className="text-center py-20 text-muted-foreground">加载中...</div>;

  const isProcessing = !['completed', 'failed', 'cancelled'].includes(job.status);
  const canCancel = !['completed', 'failed', 'cancelled'].includes(job.status);
  const canRetry = ['failed', 'cancelled'].includes(job.status) && (job.retry_count || 0) < (job.max_retries || 1);

  const cancelJob = async () => {
    if (!id) return;
    await fetch(`/api/renders/${id}/cancel`, { method: 'POST' });
    setShowCancelDialog(false);
  };

  const retryJob = async () => {
    if (!id) return;
    const res = await fetch(`/api/renders/${id}/retry`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessageDialog({ title: '重试失败', message: err.error || '无法重试该任务。', destructive: true });
      return;
    }
    const next = await res.json();
    navigate(`/render/${next.id}`);
  };

  const reassembleJob = async () => {
    if (!id || !job) return;
    setReassembling(true);
    try {
      const res = await fetch(`/api/renders/${id}/reassemble`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: job.template_id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessageDialog({ title: '重拼失败', message: err.error || '无法重拼该任务。', destructive: true });
        return;
      }
      const payload = await res.json();
      setJob(payload.job || job);
      setMessageDialog({ title: '重拼完成', message: '已使用现有分镜 clip 重新组装成片（跳过 TTS/口型）。' });
    } finally {
      setReassembling(false);
    }
  };

  const duplicateJob = async () => {
    if (!id) return;
    const res = await fetch(`/api/renders/${id}/duplicate`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessageDialog({ title: '复制失败', message: err.error || '无法复制该任务。', destructive: true });
      return;
    }
    const next = await res.json();
    navigate(`/render/${next.id}`);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => navigate('/')} className="text-brand-blue hover:text-blue-800 mb-4 inline-block">
        ← 返回模板列表
      </button>
      <h1 className="text-2xl font-bold text-foreground mb-6">视频生成</h1>

      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-brand-blue animate-pulse' : job.status === 'completed' ? 'bg-brand-green' : 'bg-destructive'}`} />
          <span className="text-lg font-medium">
            {stageLabels[job.status] || job.status}
          </span>
          <span className="text-muted-foreground text-sm ml-auto">{Math.round(job.progress)}%</span>
        </div>

        <div className="w-full bg-secondary rounded-full h-3 mb-4">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${job.status === 'failed' ? 'bg-destructive' : 'bg-brand-blue'}`}
            style={{ width: `${job.progress}%` }}
          />
        </div>

        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {['parsing', 'scene_gen', 'video_gen', 'ffmpeg', 'completed'].map((s, i) => (
            <div key={s} className={`${
              ['parsing', 'scene_gen', 'video_gen', 'ffmpeg', 'completed'].indexOf(job.status) >= i
                ? 'text-brand-blue font-medium'
                : 'text-muted-foreground'
            }`}>
              {stageLabels[s]}
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
          <div className="bg-secondary rounded-lg p-2">
            <div className="text-[10px] mb-1">流水线</div>
            <div className="text-foreground font-medium">{job.pipeline_key || '-'}</div>
          </div>
          <div className="bg-secondary rounded-lg p-2">
            <div className="text-[10px] mb-1">输入模式</div>
            <div className="text-foreground font-medium">{job.input_mode || '-'}</div>
          </div>
          <div className="bg-secondary rounded-lg p-2">
            <div className="text-[10px] mb-1">重试</div>
            <div className="text-foreground font-medium">{job.retry_count || 0}/{job.max_retries || 0}</div>
          </div>
          <div className="bg-secondary rounded-lg p-2">
            <div className="text-[10px] mb-1">工作节点</div>
            <div className="text-foreground font-medium truncate" title={job.worker_id}>{job.worker_id || '-'}</div>
          </div>
        </div>

        <div className="mt-5 flex gap-2 justify-end">
          {canCancel && (
            <button onClick={() => setShowCancelDialog(true)} className="px-3 py-1.5 text-sm border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/10">
              取消任务
            </button>
          )}
          {canRetry && (
            <button onClick={retryJob} className="px-3 py-1.5 text-sm bg-brand-blue text-primary-foreground rounded-lg hover:opacity-90">
              重试
            </button>
          )}
          <button onClick={duplicateJob} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-secondary">
            复制再生成
          </button>
          {['completed', 'failed'].includes(job.status) && (
            <button
              onClick={reassembleJob}
              disabled={reassembling}
              className="px-3 py-1.5 text-sm border border-brand-blue/30 text-brand-blue rounded-lg hover:bg-brand-blue/10 disabled:opacity-50"
            >
              {reassembling ? '重拼中...' : '重拼成片'}
            </button>
          )}
        </div>
      </div>

      {/* 日志面板 */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground/80 mb-3">执行日志</h2>
        <div className="bg-background rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{isProcessing ? '等待工作节点开始处理...' : '无日志'}</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`py-0.5 ${
                log.level === 'error' ? 'text-destructive' :
                log.level === 'warn' ? 'text-brand-amber' : 'text-brand-green'
              }`}>
                <span className="text-muted-foreground">[{log.created_at?.slice(11, 19)}]</span>{' '}
                {log.message}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {job.status === 'completed' && job.output_url && job.output_exists && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">生成结果</h2>
          <video
            src={job.output_url}
            controls
            className="w-full max-h-96 rounded-lg bg-black mx-auto"
          />
          <div className="mt-4 text-center">
            <a
              href={job.output_url}
              download
              className="inline-block px-6 py-2 bg-brand-green text-primary-foreground rounded-lg hover:opacity-90 transition"
            >
              下载视频
            </a>
          </div>
        </div>
      )}

      {job.status === 'completed' && job.output_url && !job.output_exists && (
        <div className="bg-brand-amber/10 border border-brand-amber/20 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-brand-amber mb-2">输出文件缺失</h2>
          <p className="text-sm text-muted-foreground">任务记录已完成，但本地视频文件不存在。可以复制任务重新生成。</p>
        </div>
      )}

      {(job.status === 'failed' || job.status === 'cancelled') && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-destructive mb-2">{job.status === 'cancelled' ? '任务已取消' : '生成失败'}</h2>
          {job.error_code ? (
            <p className="text-[11px] font-mono text-muted-foreground mb-2 select-all">错误码：{job.error_code}</p>
          ) : null}
          <p className="text-destructive text-sm">{job.error_message || '未知错误'}</p>
        </div>
      )}
      <ConfirmDialog
        open={showCancelDialog}
        title="取消生成任务"
        message="确定取消当前生成任务吗？取消后可以从任务详情复制再生成。"
        confirmLabel="取消任务"
        destructive
        onConfirm={cancelJob}
        onCancel={() => setShowCancelDialog(false)}
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
    </div>
  );
}
