import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCheck, IconFilm, IconTrash } from '../components/Icons';
import ConfirmDialog from '../components/ConfirmDialog';
import TextInputDialog from '../components/TextInputDialog';

interface Template {
  id: string;
  name: string;
  type: string;
  description: string;
  cover_url: string;
  status: string;
  version: number;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

type TemplateStatus = 'draft' | 'pending' | 'published' | 'offline';

export default function TemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ template: Template; status: TemplateStatus; label: string } | null>(null);
  const navigate = useNavigate();

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(data);
    } catch (e) {
      console.error('Failed to fetch templates', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const createTemplate = async (name: string) => {
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: '新品发布' }),
      });
      const t = await res.json();
      setShowCreateDialog(false);
      navigate(`/editor/${t.id}`);
    } catch (e) {
      console.error('Failed to create template', e);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      fetchTemplates();
    } catch (e) {
      console.error('Failed to delete', e);
    }
  };

  const updateTemplateStatus = async () => {
    if (!statusTarget) return;
    try {
      const res = await fetch(`/api/templates/${statusTarget.template.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusTarget.status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update template status');
      }
      setStatusTarget(null);
      fetchTemplates();
    } catch (e) {
      console.error('Failed to update template status', e);
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-secondary text-foreground/80',
    pending: 'bg-yellow-100 text-yellow-700',
    published: 'bg-brand-green/15 text-brand-green',
    offline: 'bg-destructive/15 text-destructive',
  };
  const statusLabels: Record<string, string> = {
    draft: '草稿', pending: '待发布', published: '已发布', offline: '已下线',
  };

  const nextLifecycleAction = (template: Template): { status: TemplateStatus; label: string; hint: string } => {
    switch (template.status) {
      case 'draft':
        return { status: 'pending', label: '提交待发布', hint: '提交后会进入待发布状态，编辑器仍可继续修改。' };
      case 'pending':
        return { status: 'published', label: '发布', hint: '发布会生成新版本号并记录发布时间。' };
      case 'published':
        return { status: 'offline', label: '下线', hint: '下线后模板不会作为可用生产模板展示，但历史任务不受影响。' };
      case 'offline':
        return { status: 'draft', label: '恢复草稿', hint: '恢复后可以重新编辑并再次发布。' };
      default:
        return { status: 'draft', label: '恢复草稿', hint: '恢复后可以重新编辑。' };
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold mb-2">导购视频生产流程</h2>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li><strong className="text-foreground">数字人管理</strong>：上传半身 / 全身 / 大头三图 + 录制 5–30 秒声音 → KIE 多角度形象 + MOSI 音色克隆</li>
          <li><strong className="text-foreground">模板中心</strong>：选择或创建视频模板，自定义分镜或 AI 生成脚本</li>
          <li><strong className="text-foreground">自动渲染</strong>：KIE 场景分镜 → MOSI 分镜配音 → WaveSpeed InfiniteTalk 口型 → FFmpeg 模板组装</li>
        </ol>
        <button type="button" onClick={() => navigate('/digital-humans')} className="mt-3 text-sm px-3 py-1.5 rounded-md bg-brand-blue text-white">
          先去创建数字人
        </button>
      </section>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">模板中心</h1>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          + 新建模板
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">加载中...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-muted-foreground mb-4"><IconFilm size={48} /></div>
          <p className="text-muted-foreground mb-4">还没有模板，点击「新建模板」开始创建</p>
          <button onClick={() => setShowCreateDialog(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
            创建第一个模板
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((t) => (
            <div key={t.id} className="border border-border rounded-xl overflow-hidden hover:shadow-lg transition bg-card">
              <div className="h-40 bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center">
                {t.cover_url ? (
                  <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-5xl text-muted-foreground"><IconFilm size={48} /></span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-foreground flex-1 truncate">{t.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[t.status] || ''}`}>
                    {statusLabels[t.status] || t.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{t.type || '未分类'}</p>
                <p className="text-xs text-muted-foreground mb-1">
                  {t.description || '暂无描述'} · v{t.version}
                </p>
                <p className="text-[11px] text-muted-foreground mb-3">
                  {t.published_at ? `发布于 ${new Date(t.published_at).toLocaleString()}` : `更新于 ${new Date(t.updated_at).toLocaleString()}`}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/editor/${t.id}`)}
                    className="flex-1 px-3 py-1.5 text-sm bg-blue-50 text-brand-blue rounded-lg hover:bg-blue-100 transition"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => setDeleteTarget(t)}
                    className="px-3 py-1.5 text-sm bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition"
                  >
                    删除
                  </button>
                </div>
                <button
                  onClick={() => {
                    const action = nextLifecycleAction(t);
                    setStatusTarget({ template: t, status: action.status, label: action.label });
                  }}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-accent transition"
                >
                  <IconCheck size={14} />
                  {nextLifecycleAction(t).label}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <TextInputDialog
        open={showCreateDialog}
        title="新建模板"
        message="创建后会进入编辑工作台。"
        label="模板名称"
        placeholder="例如：新品培训视频"
        confirmLabel="创建"
        onConfirm={createTemplate}
        onCancel={() => setShowCreateDialog(false)}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除模板"
        message={`确定删除模板「${deleteTarget?.name || ''}」吗？关联的渲染任务和输出文件也会一并清理。`}
        confirmLabel="删除"
        destructive
        onConfirm={() => { if (deleteTarget) deleteTemplate(deleteTarget.id); }}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={statusTarget?.label || '更新状态'}
        message={statusTarget ? `${nextLifecycleAction(statusTarget.template).hint} 模板：「${statusTarget.template.name}」。` : ''}
        confirmLabel={statusTarget?.label || '确认'}
        destructive={statusTarget?.status === 'offline'}
        onConfirm={updateTemplateStatus}
        onCancel={() => setStatusTarget(null)}
      />
    </div>
  );
}
