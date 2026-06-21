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
  brand_pack_id?: string;
  brand_pack_name?: string;
}

type TemplateStatus = 'draft' | 'pending' | 'published' | 'offline';
type BrandFilter = '' | 'unbound' | string;

interface BrandOption {
  id: string;
  name: string;
}

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
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [unboundBrandCount, setUnboundBrandCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | ''>('');
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('');
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
      if (brandFilter === 'unbound') {
        params.set('brand_unbound', '1');
      } else if (brandFilter) {
        params.set('brand_pack_id', brandFilter);
      }

      const res = await fetch(`/api/templates?${params}`);
      if (!res.ok) {
        const body = await parseApiErrorResponse(res);
        throw new Error(formatApiErrorMessage(body, '加载模板列表失败'));
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setTemplates(data);
        setE2eCount(0);
      } else {
        setTemplates(data.items || []);
        setE2eCount(Number(data.meta?.e2e_count ?? 0));
        setUnboundBrandCount(Number(data.meta?.unbound_brand_count ?? 0));
      }
    } catch (e) {
      console.error('Failed to fetch templates', e);
      showApiToast(e instanceof Error ? e.message : '加载模板列表失败', { destructive: true });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, brandFilter, showE2e]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    fetch('/api/library?category=brand&limit=120')
      .then((r) => r.json())
      .then((d) => {
        const items = (d.items || []) as Array<{ id: string; name: string }>;
        setBrandCount(Number(d.total ?? items.length ?? 0));
        setBrandOptions(items.map((item) => ({ id: item.id, name: item.name })));
      })
      .catch(() => {
        setBrandCount(null);
        setBrandOptions([]);
      });
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
      let editorPath = `/editor/${t.id}`;
      if (brandCount && brandCount > 0) {
        try {
          const brandRes = await fetch('/api/library?category=brand&limit=1');
          if (brandRes.ok) {
            const brandData = await brandRes.json();
            const firstBrand = brandData.items?.[0];
            if (firstBrand?.id) {
              editorPath = `/editor/${t.id}?brand_id=${encodeURIComponent(firstBrand.id)}`;
            }
          }
        } catch {
          /* keep default path */
        }
      }
      navigate(editorPath);
    } catch (e) {
      console.error('Failed to create template', e);
      showApiToast(e instanceof Error ? e.message : '创建模板失败', { destructive: true });
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await parseApiErrorResponse(res);
        throw new Error(formatApiErrorMessage(body, '删除模板失败'));
      }
      setDeleteTarget(null);
      fetchTemplates();
    } catch (e) {
      console.error('Failed to delete', e);
      showApiToast(e instanceof Error ? e.message : '删除模板失败', { destructive: true });
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
        const body = await parseApiErrorResponse(res);
        throw new Error(formatApiErrorMessage(body, '更新模板状态失败'));
      }
      setStatusTarget(null);
      fetchTemplates();
    } catch (e) {
      console.error('Failed to update template status', e);
      showApiToast(e instanceof Error ? e.message : '更新模板状态失败', { destructive: true });
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
        <h2 className="text-base font-semibold mb-2">导购视频主路径</h2>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li><strong className="text-foreground">选模板</strong>：在模板中心挑选或新建运营模板</li>
          <li><strong className="text-foreground">绑品牌包</strong>：编辑器选用资产库品牌包，统一字幕与镜头</li>
          <li><strong className="text-foreground">套外观</strong>：顶部 Banner 一键套用品牌推荐 HyperFrames 动效</li>
          <li><strong className="text-foreground">提交生成</strong>：使用「模板编辑器」流水线提交，HF 动效自动叠加</li>
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

      {unboundBrandCount > 0 && brandFilter !== 'unbound' && (
        <div
          data-testid="unbound-brand-banner"
          className="mb-4 rounded-lg border border-brand-amber/30 bg-brand-amber/10 px-4 py-3 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3"
        >
          <span>有 {unboundBrandCount} 个模板未绑定品牌包，渲染前建议先去资产库选用。</span>
          <button
            type="button"
            onClick={() => setBrandFilter('unbound')}
            className="text-brand-blue hover:underline shrink-0 font-medium"
          >
            查看未绑定
          </button>
        </div>
      )}

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
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          品牌包
          <select
            data-testid="template-brand-filter"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value as BrandFilter)}
            className="h-9 min-w-[140px] rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">全部品牌</option>
            <option value="unbound">未绑定品牌包</option>
            {brandOptions.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.name}</option>
            ))}
          </select>
        </label>
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
            {brandFilter === 'unbound'
              ? '没有未绑定品牌包的模板'
              : brandFilter
                ? '没有匹配该品牌包的模板'
                : showE2e
                  ? '没有匹配的模板'
                  : '还没有运营模板，点击「新建模板」开始创建'}
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
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  {t.brand_pack_id ? (
                    <span
                      data-testid="template-brand-badge"
                      className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-medium text-brand-blue"
                      title={`品牌包 ID: ${t.brand_pack_id}`}
                    >
                      {t.brand_pack_name || '已绑定品牌包'}
                    </span>
                  ) : (
                    <>
                      <span
                        data-testid="template-unbound-badge"
                        className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        未绑定品牌包
                      </span>
                      <Link
                        to={`/editor/${t.id}?pick_brand=1`}
                        data-testid="template-bind-brand-link"
                        className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-medium text-brand-blue hover:bg-brand-blue/20"
                      >
                        去选用品牌包
                      </Link>
                    </>
                  )}
                </div>
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