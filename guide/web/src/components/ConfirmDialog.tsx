import { IconAlertCircle, IconX } from './Icons';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel = '确认', destructive = false, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <IconAlertCircle size={20} className={destructive ? 'text-destructive' : 'text-brand-amber'} />
          <div className="flex-1">
            <h3 id="confirm-dialog-title" className="text-[16px] font-medium">{title}</h3>
            <p className="text-[14px] text-muted-foreground mt-1">{message}</p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><IconX size={18} /></button>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="h-9 px-4 text-[14px] bg-secondary text-secondary-foreground rounded-md hover:bg-accent">取消</button>
          <button onClick={onConfirm} className={`h-9 px-4 text-[14px] rounded-md font-medium ${destructive ? 'bg-destructive text-white hover:opacity-90' : 'bg-primary text-primary-foreground hover:opacity-90'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
