import { useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'guide_onboarding_dismissed';

const STEPS = [
  {
    title: '同步资产',
    body: '在资产库导入品牌包、脚本与音色，或一键同步内置素材目录。',
    cta: { label: '打开资产库', href: '/assets?tab=brand' },
  },
  {
    title: '准备数字人',
    body: '上传照片与声音样本训练数字人，成片口型与音色将与此绑定。',
    cta: { label: '管理数字人', href: '/assets?tab=digital_human' },
  },
  {
    title: '选择模板并生成',
    body: '从模板中心挑选运营模板，在编辑器关联品牌与数字人后提交生成。',
    cta: { label: '浏览模板', href: '/' },
  },
] as const;

export default function OnboardingWizard() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);

  if (dismissed) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">新手引导</p>
          <h2 className="text-base font-semibold text-foreground mt-0.5">三步完成第一条导购视频</h2>
        </div>
        <button type="button" onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground">
          不再显示
        </button>
      </div>

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
              to={current.cta.href}
              onClick={dismiss}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 no-underline"
            >
              {current.cta.label}
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
          <Link to={current.cta.href} className="text-xs text-brand-blue hover:underline">
            {current.cta.label}
          </Link>
        </div>
      </div>
    </div>
  );
}