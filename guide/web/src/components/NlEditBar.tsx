import { useState } from 'react';
import { applyNlPatches } from '@shared/aiHelpers';
import type { DSL } from '../store/editorStore';

interface Props {
  dsl: DSL;
  segIndex: number;
  onApply: (next: DSL) => void;
}

export default function NlEditBar({ dsl, segIndex, onApply }: Props) {
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  const run = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    setBusy(true);
    setHint('');
    try {
      const res = await fetch('/api/ai/nl-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, seg_index: segIndex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHint(data.error || '无法理解该指令');
        return;
      }
      const next = applyNlPatches(dsl, data.patches);
      onApply(next);
      setHint(data.summary || '已应用修改');
      setCommand('');
    } catch {
      setHint('请求失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-2 border-b border-border bg-secondary/30 shrink-0">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border" title="基于关键词规则解析，非大模型">
          规则引擎
        </span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
          placeholder="指令示例：把时长改成 8 秒 / 开启字幕 / 转场改成淡入淡出"
          className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-[11px] outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          disabled={busy || !command.trim()}
          onClick={() => void run()}
          className="h-8 px-3 rounded-md bg-brand-blue text-white text-[11px] disabled:opacity-40"
        >
          {busy ? '...' : '应用'}
        </button>
      </div>
      {hint ? <p className="text-[10px] text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}