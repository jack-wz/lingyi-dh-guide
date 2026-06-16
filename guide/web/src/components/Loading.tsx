export default function Loading({ text = '加载中...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin mr-2" />
      <span className="text-[14px]">{text}</span>
    </div>
  );
}
