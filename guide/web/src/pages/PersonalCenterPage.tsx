import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog';

interface RenderJob {
  id: string;
  template_id: string;
  template_name?: string;
  template_type?: string;
  digital_human_id: string;
  status: string;
  output_url: string;
  output_exists: boolean;
  error_message: string;
  progress: number;
  stage: string;
  created_at: string;
  completed_at: string;
}

function completedPlaybackBadge(job: RenderJob): { label: string; className: string } {
  if (job.output_url && job.output_exists) {
    return { label: '可播放', className: 'bg-brand-green text-primary-foreground' };
  }
  if (job.output_url) {
    return { label: '成片已清理', className: 'bg-brand-amber/90 text-foreground' };
  }
  return { label: '无成片', className: 'bg-secondary text-muted-foreground' };
}

function jobDisplayTitle(job: RenderJob): string {
  return job.template_name?.trim() || '未命名模板';
}

interface UnifiedTask {
  id: string;
  task_type: 'render' | 'dh_training';
  status: string;
  progress: number;
  stage: string;
  title: string;
  subtitle: string;
  error_message: string;
  link: string;
  updated_at: string;
}

const PAGE_SIZE = 12;

export default function PersonalCenterPage() {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [page, setPage] = useState(0);
  const [activeTasks, setActiveTasks] = useState<UnifiedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<RenderJob | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RenderJob | null>(null);
  const [messageDialog, setMessageDialog] = useState<{ title: string; message: string; destructive?: boolean } | null>(null);

  const fetchJobs = async () => {
    try {
      const offset = page * PAGE_SIZE;
      const [rendersRes, tasksRes] = await Promise.all([
        fetch(`/api/renders?limit=${PAGE_SIZE}&offset=${offset}`),
        fetch('/api/tasks?scope=active&limit=20'),
      ]);
      const payload = await rendersRes.json();
      const items: RenderJob[] = Array.isArray(payload) ? payload : (payload.items || []);
      setJobs(items.filter(j => ['completed', 'failed', 'cancelled'].includes(j.status)));
      setTotalJobs(Array.isArray(payload) ? items.length : Number(payload.total ?? items.length));
      const tasksPayload = await tasksRes.json();
      setActiveTasks(tasksPayload.items || []);
    } catch (e) {
      console.error('Failed to fetch render jobs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [page]);

  const completedJobs = jobs.filter(j => j.status === 'completed');
  const failedJobs = jobs.filter(j => j.status === 'failed');
  const cancelledJobs = jobs.filter(j => j.status === 'cancelled');

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const requestDeleteJob = (job: RenderJob, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(job);
  };

  const deleteJob = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/renders/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setJobs((prev) => prev.filter((j) => j.id !== deleteTarget.id));
      if (selectedVideo?.id === deleteTarget.id) setSelectedVideo(null);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete render job', err);
      setMessageDialog({ title: '删除失败', message: '删除渲染记录失败，请重试。', destructive: true });
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground mb-2">我的视频</h1>
      <p className="text-muted-foreground mb-6">查看您的视频生成历史记录</p>

      {activeTasks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">进行中 ({activeTasks.length})</h2>
          <div className="space-y-2">
            {activeTasks.map((task) => (
              <Link
                key={`${task.task_type}-${task.id}`}
                to={task.link}
                className="flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-brand-blue/40 transition-colors"
              >
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${task.task_type === 'dh_training' ? 'bg-brand-amber animate-pulse' : 'bg-brand-blue animate-pulse'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{task.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {task.task_type === 'dh_training' ? '数字人训练' : '视频渲染'} · {task.stage || task.status}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground shrink-0">{Math.round(task.progress)}%</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-brand-blue">{completedJobs.length}</div>
          <div className="text-sm text-muted-foreground mt-1">成功生成</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-destructive">{failedJobs.length}</div>
          <div className="text-sm text-muted-foreground mt-1">生成失败</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-muted-foreground">{cancelledJobs.length}</div>
          <div className="text-sm text-muted-foreground mt-1">已取消</div>
        </div>
      </div>

      {/* Completed Videos */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          成功记录 ({completedJobs.length})
        </h2>
        {completedJobs.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          暂无成功记录
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedJobs.map(job => (
              <div
                key={job.id}
                role="button"
                tabIndex={0}
                aria-label={`${jobDisplayTitle(job)} ${completedPlaybackBadge(job).label}`}
                className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg transition cursor-pointer"
                onClick={() => setSelectedVideo(job)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedVideo(job);
                  }
                }}
              >
                <div className="aspect-video bg-secondary relative">
                  {job.output_url && job.output_exists ? (
                    <video
                      src={job.output_url}
                      className="w-full h-full object-cover"
                      muted
                      preload="none"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                    {job.output_url ? '成片已清理' : '无视频'}
                    </div>
                  )}
                  <div className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded ${completedPlaybackBadge(job).className}`}>
                    {completedPlaybackBadge(job).label}
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-sm text-foreground/80 font-medium truncate">
                    {jobDisplayTitle(job)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                    {job.id.slice(0, 8)} · {formatDate(job.completed_at || job.created_at)}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedVideo(job); }}
                      className="text-xs text-brand-blue hover:text-blue-800"
                    >
                      播放
                    </button>
                    <Link
                      to={`/render/${job.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-muted-foreground hover:text-foreground/80"
                    >
                      详情
                    </Link>
                    {job.output_url && job.output_exists && (
                      <a
                        href={job.output_url}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-brand-green hover:opacity-80"
                      >
                        下载
                      </a>
                    )}
                    <button
                      onClick={(e) => requestDeleteJob(job, e)}
                      className="text-xs text-destructive hover:text-destructive"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Failed Jobs */}
      {failedJobs.length + cancelledJobs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            异常记录 ({failedJobs.length + cancelledJobs.length})
          </h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-left text-muted-foreground">任务 ID</th>
                  <th className="px-4 py-2 text-left text-muted-foreground">创建时间</th>
                  <th className="px-4 py-2 text-left text-muted-foreground">错误信息</th>
                  <th className="px-4 py-2 text-left text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {[...failedJobs, ...cancelledJobs].map(job => (
                  <tr key={job.id} className="border-b border-border/50 hover:bg-secondary">
                    <td className="px-4 py-2 font-mono text-xs">{job.id.slice(0, 8)}...</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(job.created_at)}</td>
                    <td className={`px-4 py-2 max-w-xs truncate ${job.status === 'cancelled' ? 'text-muted-foreground' : 'text-destructive'}`} title={job.error_message}>
                      {job.status === 'cancelled' ? '用户取消' : (job.error_message || '未知错误')}
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/render/${job.id}`} className="text-brand-blue hover:text-blue-800">
                        查看日志
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Video Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="bg-card rounded-xl max-w-2xl w-full p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-player-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 id="video-player-title" className="font-semibold text-foreground">{jobDisplayTitle(selectedVideo)}</h3>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-muted-foreground hover:text-muted-foreground text-xl"
              >
                ✕
              </button>
            </div>
            {selectedVideo.output_url && selectedVideo.output_exists ? (
              <video
                src={selectedVideo.output_url}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
              />
            ) : (
              <div className="rounded-lg bg-secondary border border-border p-8 text-center text-muted-foreground">
                {selectedVideo.output_url ? '输出文件缺失，无法播放' : '该任务没有可播放视频'}
              </div>
            )}
            <div className="flex items-center justify-between mt-3">
              <span className="text-sm text-muted-foreground">
                {formatDate(selectedVideo.completed_at || selectedVideo.created_at)}
              </span>
              <div className="flex gap-2">
                <Link
                  to={`/render/${selectedVideo.id}`}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-secondary"
                >
                  查看详情
                </Link>
                {selectedVideo.output_url && selectedVideo.output_exists && (
                  <a
                    href={selectedVideo.output_url}
                    download
                    className="px-3 py-1.5 text-sm bg-brand-green text-primary-foreground rounded-lg hover:opacity-90"
                  >
                    下载视频
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除渲染记录"
        message={`确定删除「${deleteTarget ? jobDisplayTitle(deleteTarget) : ''}」的渲染记录吗？关联输出文件也会一起清理。`}
        confirmLabel="删除"
        destructive
        onConfirm={deleteJob}
        onCancel={() => setDeleteTarget(null)}
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

      {totalJobs > PAGE_SIZE && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-3 py-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-40"
          >
            上一页
          </button>
          <span>
            第 {page + 1} / {Math.max(1, Math.ceil(totalJobs / PAGE_SIZE))} 页 · 共 {totalJobs} 条
          </span>
          <button
            type="button"
            disabled={(page + 1) * PAGE_SIZE >= totalJobs}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link to="/debug" className="text-brand-blue hover:underline">开发者 · 集成 Playground</Link>
      </p>
    </div>
  );
}
