import { useState } from 'react';
import { Link } from 'react-router-dom';

interface LibrarySummary {
  counts?: Record<string, number>;
}

interface Props {
  summary: LibrarySummary | null;
  onImported?: () => void;
  className?: string;
}

export function isLibrarySparse(summary: LibrarySummary | null): boolean {
  if (!summary?.counts) return false;
  const { brand = 0, script = 0, voice = 0, digital_human: dh = 0 } = summary.counts;
  return brand < 2 && script < 3 && voice < 3 && dh < 1;
}

export default function ImportCatalogBanner({ summary, onImported, className = '' }: Props) {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('guide_import_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });

  if (dismissed || !isLibrarySparse(summary)) return null;

  const handleImport = async () => {
    setImporting(true);
    setMessage('');
    try {
      const res = await fetch('/api/library/import-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '同步失败');
      const parts = [
        data.brands_imported != null ? `品牌 ${data.brands_imported}` : null,
        data.scripts_imported != null ? `脚本 ${data.scripts_imported}` : null,
        data.voices_imported != null ? `音色 ${data.voices_imported}` : null,
      ].filter(Boolean);
      setMessage(parts.length > 0 ? `已同步：${parts.join('、')}` : '素材目录同步完成');
      onImported?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '同步失败');
    } finally {
      setImporting(false);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem('guide_import_banner_dismissed', '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className={`rounded-xl border border-brand-blue/30 bg-brand-blue/5 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">首次使用？同步内置素材库</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            一键导入 OpenStoryline / opentalking 品牌包、脚本与音色种子，避免从空白资产库开始。
            也可在品牌 Tab 使用「从本地模板重置」。
          </p>
          {message && <p className="text-xs text-brand-blue mt-2">{message}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={importing}
            onClick={handleImport}
            className="px-3 py-1.5 rounded-md bg-brand-blue text-white text-sm hover:opacity-90 disabled:opacity-50"
          >
            {importing ? '同步中…' : '同步素材目录'}
          </button>
          <Link to="/assets?tab=brand" className="text-xs text-brand-blue hover:underline">
            手动配置
          </Link>
          <button type="button" onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground">
            暂不
          </button>
        </div>
      </div>
    </div>
  );
}