export default function UnsavedExitDialog({
  saving,
  onCancel,
  onDiscard,
  onSaveAndExit,
}: {
  saving: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndExit: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-medium text-foreground">离开编辑器？</h3>
        <p className="text-[14px] text-muted-foreground mt-2">
          当前模板还有未保存修改。可以先保存再离开，也可以放弃本次修改。
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="h-9 px-4 text-[14px] bg-secondary text-secondary-foreground rounded-md hover:bg-accent">继续编辑</button>
          <button onClick={onDiscard} className="h-9 px-4 text-[14px] border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10">放弃离开</button>
          <button
            onClick={onSaveAndExit}
            disabled={saving}
            className="h-9 px-4 text-[14px] rounded-md font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
          >
            {saving ? '保存中...' : '保存并离开'}
          </button>
        </div>
      </div>
    </div>
  );
}