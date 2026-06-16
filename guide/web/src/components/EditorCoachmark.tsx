import { useEffect, useState } from 'react';

const STORAGE_KEY = 'guide-editor-coachmark-v2';

export default function EditorCoachmark() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = window.setTimeout(() => setVisible(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) return null;

  const steps = [
    {
      title: '拖拽画布 = 改位置',
      body: '在预览区拖动字幕、贴片和对象，位置会同步到右侧样式面板。',
    },
    {
      title: '分镜与图层',
      body: '左侧切换分镜；右侧「图层」查看当前分镜各层，选中后在「对象」面板编辑属性。底部可切换脚本或时间轴。',
    },
  ];

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  const current = steps[step];

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-[min(420px,calc(100vw-2rem))]">
      <div className="rounded-lg border border-brand-blue/30 bg-card shadow-lg p-4 transition-opacity duration-150">
        <div className="text-sm font-semibold text-foreground">{current.title}</div>
        <p className="text-xs text-muted-foreground mt-1 leading-5">{current.body}</p>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-muted-foreground">{step + 1} / {steps.length}</span>
          <div className="flex gap-2">
            <button type="button" onClick={dismiss} className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1">
              跳过
            </button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep((s) => s + 1)} className="text-[11px] bg-brand-blue text-white px-3 py-1 rounded-md">
                下一步
              </button>
            ) : (
              <button type="button" onClick={dismiss} className="text-[11px] bg-brand-blue text-white px-3 py-1 rounded-md">
                知道了
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}