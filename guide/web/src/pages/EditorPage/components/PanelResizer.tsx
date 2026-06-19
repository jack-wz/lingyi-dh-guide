import { useRef, useState } from 'react';

export default function PanelResizer({ onResize }: { onResize: (delta: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const lastX = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    lastX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const delta = e.clientX - lastX.current;
    if (delta !== 0) {
      onResize(delta);
      lastX.current = e.clientX;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`w-1.5 shrink-0 cursor-col-resize transition-colors ${dragging ? 'bg-primary' : 'bg-border hover:bg-primary/60'}`}
    />
  );
}