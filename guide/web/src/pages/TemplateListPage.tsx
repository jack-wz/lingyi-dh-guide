import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconCheck, IconFilm, IconSearch, IconTrash } from '../components/Icons';
import ConfirmDialog from '../components/ConfirmDialog';
import TextInputDialog from '../components/TextInputDialog';
import { parseApiErrorResponse, formatApiErrorMessage } from '../utils/apiError';
import { showApiToast } from '../components/ApiToast';
import OnboardingWizard from '../components/OnboardingWizard';

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

const STATUS_FILTERS: { id: TemplateStatus | ''; label: string }[] = [
  { id: '', label: '全部' },
  { id: 'draft', label: '草稿' },
  { id: 'pending', label: '待发布' },
  { id: 'published', label: '已发布' },
  { id: 'offline', label: '已下线' },
];

export default function TemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [e2eCount, setE2eCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ template: Template; status: TemplateStatus; label: string } | null>(null);
  const [brandCount, setBrandCount] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | ''>('');
  const [showE2e, setShowE2e] = useState(false);
  const navigate = useNavigate();

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ with_meta: '1' });
      if (showE2e) {
        params.set('include_e2e', '1');
      } else {
        params.set('exclude_e2e', '1');
      }
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/templates?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setTemplates(data);
        setE2eCount(0);
      } else {
        setTemplates(data.items || []);
        setE2eCount(Number(data.meta?.e2e_count ?? 0));
      }
    } catch (e) {
      console.error('Failed to fetch templates', e);
      showApiToast(e instanceof Error ? e.message : '加载模板列表失败', { destructive: true });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, showE2e]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    fetch('/api/library?category=brand&limit=1')
      .then((r) => r.json())
      .then((d) => setBrandCount(Number(d.total ?? d.items?.length ?? 0)))
      .catch(() => setBrandCount(null));
  }, []);

  const createTemplate = async (name: string) => {
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: '新品发布' }),
      });
      if (!res.ok) {
        const body = await parseApiErrorResponse(res);
        throw new Error(formatApiErrorMessage(body, '创建模板失败'));
      }
      const t = await res.json();
      setShowCreateDialog(false);
      navigate(`/editor/${t.id}`);
    } catch (e) {
      console.error('Failed to create template', e);
      showApiToast(e instanceof Error ? e.message : '创建模板失败', { destructive: true });
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
      <OnboardingWizard />
      {brandCount === 0 && (
        <div className="mb-4 rounded-lg border border-brand-amber/30 bg-brand-amber/10 px-4 py-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
          <span>首次使用请先在资产库初始化品牌包并选择，再创建模板。</span>
          <Link to="/assets?tab=brand" className="text-brand-blue hover:underline shrink-0">去资产库</Link>
        </div>
      )}

      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold mb-2">导购视频生产流程</h2>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li><strong className="text-foreground">数字人管理</strong>：上传半身 / 全身 / 大头三图 + 录制 5–30 秒声音 → KIE 多角度形象 + MOSI 音色克隆</li>
          <li><strong className="text-foreground">模板中心</strong>：选择或创建视频模板，自定义分镜或 AI 生成脚本</li>
          <li><strong className="text-foreground">自动渲染</strong>：KIE 场景分镜 → MOSI 分镜配音 → WaveSpeed InfiniteTalk 口型 → FFmpeg 模板组装</li>
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="text-sm px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            + 新建模板
          </button>
          <Link to="/assets?tab=digital_human" className="text-sm text-brand-blue hover:underline">
            先去创建数字人
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-foreground">模板中心</h1>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          + 新建模板
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模板名称、类型…"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-border bg-background"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id || 'all'}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                statusFilter === f.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">加载中...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-muted-foreground mb-4"><IconFilm size={48} /></div>
          <p className="text-muted-foreground mb-4">
            {showE2e ? '没有匹配的模板' : '还没有运营模板，点击「新建模板」开始创建'}
          </p>
          <button onClick={() => setShowCreateDialog(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
            创建第一个模板
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((t) => (
            <div key={t.id} data-testid="template-card" className="border border-border rounded-xl overflow-hidden hover:shadow-lg transition bg-card">
              <div className="h-40 bg-secondary flex items-center justify-center">
                {t.cover_url ? (
                  <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground"><IconFilm size={48} /></span>
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

      {e2eCount > 0 && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {showE2e ? (
            <button type="button" onClick={() => setShowE2e(false)} className="text-brand-blue hover:underline">
              隐藏测试模板
            </button>
          ) : (
            <button type="button" onClick={() => setShowE2e(true)} className="text-brand-blue hover:underline">
              显示测试模板 ({e2eCount})
            </button>
          )}
          <span className="mx-2">·</span>
          <Link to="/debug" className="text-brand-blue hover:underline">开发者 · 集成 Playground</Link>
        </p>
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