import { useEffect, useState } from 'react';

export type ToastPayload = {
  id: number;
  message: string;
  destructive?: boolean;
};

let seq = 0;
const listeners = new Set<(t: ToastPayload) => void>();

export function showApiToast(message: string, options?: { destructive?: boolean }) {
  const payload: ToastPayload = {
    id: ++seq,
    message,
    destructive: options?.destructive,
  };
  listeners.forEach((fn) => fn(payload));
}

export function showApiErrorToast(body: { error?: string; error_code?: string; remediation?: string }, fallback = '请求失败') {
  const code = body.error_code ? `[${body.error_code}] ` : '';
  const hint = body.remediation ? ` — ${body.remediation}` : '';
  showApiToast(`${code}${body.error || fallback}${hint}`, { destructive: true });
}

export default function ApiToastHost() {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    const onToast = (t: ToastPayload) => {
      setToast(t);
      window.clearTimeout((onToast as { _tid?: number })._tid);
      const tid = window.setTimeout(() => setToast(null), 8000);
      (onToast as { _tid?: number })._tid = tid;
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-[min(92vw,32rem)] px-4 py-3 rounded-lg shadow-lg border text-sm whitespace-pre-wrap ${
        toast.destructive
          ? 'bg-destructive/95 text-destructive-foreground border-destructive'
          : 'bg-card text-foreground border-border'
      }`}
      data-testid="api-toast"
    >
      {toast.message}
      <button
        type="button"
        className="ml-3 text-xs underline opacity-80"
        onClick={() => setToast(null)}
      >
        关闭
      </button>
    </div>
  );
}