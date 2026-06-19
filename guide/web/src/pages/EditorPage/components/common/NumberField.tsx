import * as React from 'react';

export default function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [localValue, setLocalValue] = React.useState(value);
  const scrubbingRef = React.useRef<{ startX: number; startVal: number; pointerId: number } | null>(null);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step));

  const startScrub = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const isFine = e.shiftKey;
    const range = max - min;
    // Larger physical drag distance = silkier control (inspired by timeline scrub + cenker smooth feel)
    const baseSensitivity = range / (isFine ? 1200 : 420); // fine mode when Shift

    scrubbingRef.current = {
      startX: e.clientX,
      startVal: localValue,
      pointerId: e.pointerId,
      sensitivity: baseSensitivity,
    };

    const move = (moveEvent: PointerEvent) => {
      const s = scrubbingRef.current;
      if (!s) return;
      const dx = moveEvent.clientX - s.startX;
      const next = clamp(s.startVal + dx * s.sensitivity);
      setLocalValue(next);
      onChange(next);
    };

    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      try {
        target.releasePointerCapture(scrubbingRef.current?.pointerId ?? 0);
      } catch {}
      scrubbingRef.current = null;
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  };

  return (
    <label className="mt-3 block text-xs text-muted-foreground">
      <div className="mb-1 flex items-center justify-between">
        <span
          className="select-none cursor-ew-resize active:text-foreground"
          onPointerDown={startScrub}
          title="拖动调整（左右拖动丝滑控制）"
        >
          {label}
        </span>
        <span className="font-mono tabular-nums">{Math.round(localValue)}</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={(e) => {
            const v = clamp(Number(e.target.value));
            setLocalValue(v);
            onChange(v);
          }}
          className="flex-1 accent-brand-blue"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={(e) => {
            const v = clamp(Number(e.target.value));
            setLocalValue(v);
            onChange(v);
          }}
          className="w-16 h-7 rounded border border-border bg-background px-1.5 text-[11px] text-right"
        />
      </div>
    </label>
  );
}
