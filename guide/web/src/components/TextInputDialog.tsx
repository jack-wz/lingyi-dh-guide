import { useEffect, useState } from 'react';
import { IconX } from './Icons';

interface Props {
  open: boolean;
  title: string;
  message?: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function TextInputDialog({
  open,
  title,
  message,
  label,
  placeholder,
  initialValue = '',
  confirmLabel = '确认',
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [initialValue, open]);

  if (!open) return null;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            <h3 className="text-[16px] font-medium">{title}</h3>
            {message && <p className="text-[14px] text-muted-foreground mt-1">{message}</p>}
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><IconX size={18} /></button>
        </div>
        <label className="block text-xs text-muted-foreground mb-1">{label}</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={placeholder}
          className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="h-9 px-4 text-[14px] bg-secondary text-secondary-foreground rounded-md hover:bg-accent">取消</button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="h-9 px-4 text-[14px] rounded-md font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
