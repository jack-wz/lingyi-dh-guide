import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'guide_onboarding_dismissed';

type OnboardingContext = {
  templateId?: string;
  unboundTemplateId?: string;
  brandCount: number | null;
};

type StepDef = {
  title: string;
  body: string;
  ctaLabel: string;
  href: (ctx: OnboardingContext) => string;
};

const STEPS: StepDef[] = [
  {
    title: '选运营模板',
    body: '在模板中心挑选或新建一条导购模板，作为成片骨架与分镜结构。',
    ctaLabel: '浏览模板',
    href: () => '/',
  },
  {
    title: '绑定品牌包',
    body: '进入编辑器从资产库选用品牌包，统一字幕样式、字体与镜头规范。',
    ctaLabel: '去选用品牌包',
    href: (ctx) => {
      const id = ctx.unboundTemplateId || ctx.templateId;
      return id ? `/editor/${id}?pick_brand=1` : '/assets?tab=brand';
    },
  },
  {
    title: '套用品牌外观',
    body: '绑定后编辑器顶部会出现推荐 Banner，一键套用品牌动效、HF 字幕与转场。',
    ctaLabel: '打开编辑器',
    href: (ctx) => {
      const id = ctx.unboundTemplateId || ctx.templateId;
      return id ? `/editor/${id}` : '/';
    },
  },
  {
    title: '提交生成',
    body: '检查分镜与配音后，在导出面板使用「模板编辑器」流水线提交；HF 动效会在成片后自动叠加。',
    ctaLabel: '去生成成片',
    href: (ctx) => {
      const id = ctx.unboundTemplateId || ctx.templateId;
      return id ? `/editor/${id}` : '/';
    },
  },
];

export default function OnboardingWizard() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);
  const [ctx, setCtx] = useState<OnboardingContext>({ brandCount: null });

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    Promise.all([
      fetch('/api/templates?exclude_e2e=1&limit=12').then((r) => r.json()),
      fetch('/api/library?category=brand&limit=1').then((r) => r.json()),
    ])
      .then(([templatesBody, brandBody]) => {
        if (cancelled) return;
        const items = Array.isArray(templatesBody)
          ? templatesBody
          : (templatesBody.items || []) as Array<{ id: string; brand_pack_id?: string }>;
        const first = items[0];
        const unbound = items.find((t) => !t.brand_pack_id);
        const brandItems = (brandBody.items || []) as unknown[];
        setCtx({
          templateId: first?.id,
          unboundTemplateId: unbound?.id,
          brandCount: Number(brandBody.total ?? brandItems.length ?? 0),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [dismissed]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const ctaHref = useMemo(() => current.href(ctx), [current, ctx]);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5" data-testid="onboarding-wizard">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">新手引导</p>
          <h2 className="text-base font-semibold text-foreground mt-0.5">四步完成第一条导购视频</h2>
        </div>
        <button type="button" onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground">
          不再显示
        </button>
      </div>

      {ctx.brandCount === 0 && (
        <p className="mb-3 text-xs text-brand-amber">
          资产库尚无品牌包，建议先在步骤 2 前往资产库同步内置品牌模板。
        </p>
      )}

      <div className="flex gap-2 mb-4">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => setStep(i)}
            className={`flex-1 h-1.5 rounded-full transition-colors ${
              i <= step ? 'bg-brand-blue' : 'bg-secondary'
            }`}
            aria-label={`步骤 ${i + 1}: ${s.title}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-brand-blue font-medium mb-1">
            步骤 {step + 1} / {STEPS.length} · {current.title}
          </p>
          <p className="text-sm text-muted-foreground">{current.body}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
            >
              上一步
            </button>
          )}
          {isLast ? (
            <Link
              to={ctaHref}
              onClick={dismiss}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 no-underline"
            >
              {current.ctaLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
            >
              下一步
            </button>
          )}
          <Link to={ctaHref} className="text-xs text-brand-blue hover:underline">
            {current.ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}