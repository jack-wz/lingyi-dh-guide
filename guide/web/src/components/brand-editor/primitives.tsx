import type { ReactNode } from 'react';

export function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function parseTokenValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === '') return '';
  const num = Number(value);
  if (!Number.isNaN(num) && String(num) === value) return num;
  return value;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
      />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-y"
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
      >
        {options.map((opt) => {
          const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
          return <option key={o.value} value={o.value}>{o.label}</option>;
        })}
      </select>
    </label>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const safe = value?.startsWith('#') ? value : '#000000';
  return (
    <div className="flex items-end gap-2">
      <input
        type="color"
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 rounded border border-border p-0.5 shrink-0"
      />
      <div className="flex-1">
        <TextField label={label} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

export function TokenEditor({
  title,
  values,
  onChange,
  valueType = 'text',
}: {
  title: string;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  valueType?: 'text' | 'color';
}) {
  const entries = Object.entries(values || {});
  const updateKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey || !newKey.trim()) return;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values || {})) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  };
  const updateValue = (key: string, raw: string) => {
    onChange({ ...values, [key]: valueType === 'color' ? raw : parseTokenValue(raw) });
  };
  const add = () => onChange({ ...values, new_key: valueType === 'color' ? '#2563eb' : '' });
  const remove = (key: string) => {
    const next = { ...values };
    delete next[key];
    onChange(next);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <button type="button" onClick={add} className="rounded-md bg-brand-blue px-2 py-1 text-[11px] text-white hover:opacity-90">
          添加
        </button>
      </div>
      <div className="space-y-2">
        {entries.length === 0 && <p className="text-xs text-muted-foreground">暂无配置，点击添加</p>}
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <input
              type="text"
              defaultValue={key}
              onBlur={(e) => updateKey(key, e.target.value.trim())}
              className="w-28 rounded-md border border-border px-2 py-1.5 text-xs"
              placeholder="键名"
            />
            {valueType === 'color' ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="color"
                  value={String(value || '#000000')}
                  onChange={(e) => updateValue(key, e.target.value)}
                  className="h-8 w-10 rounded border border-border p-0.5"
                />
                <input
                  type="text"
                  value={String(value || '')}
                  onChange={(e) => updateValue(key, e.target.value)}
                  className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-mono"
                />
                <div className="w-8 h-8 rounded border border-border shrink-0" style={{ background: String(value) }} />
              </div>
            ) : (
              <input
                type="text"
                value={String(value ?? '')}
                onChange={(e) => updateValue(key, e.target.value)}
                className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs"
              />
            )}
            <button type="button" onClick={() => remove(key)} className="text-[11px] text-destructive hover:underline shrink-0">
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SimpleListEditor<T extends { id: string; name: string }>({
  title,
  items,
  selectedId,
  onSelect,
  onChange,
  defaultItem,
  renderForm,
  renderPreview,
}: {
  title: string;
  items: T[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (items: T[]) => void;
  defaultItem: () => T;
  renderForm: (item: T, onPatch: (patch: Partial<T>) => void) => ReactNode;
  renderPreview?: (item: T) => ReactNode;
}) {
  const selected = items.find((i) => i.id === selectedId) || items[0] || null;
  const add = () => {
    const next = defaultItem();
    onChange([...items, next]);
    onSelect(next.id);
  };
  const remove = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    onChange(next);
    if (selected?.id === id) onSelect(next[0]?.id || null);
  };
  const patch = (p: Partial<T>) => {
    if (!selected) return;
    onChange(items.map((i) => (i.id === selected.id ? { ...i, ...p } : i)));
  };

  return (
    <div className="flex min-h-[320px] gap-3">
      <div className="flex w-44 shrink-0 flex-col gap-2 border-r border-border pr-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <button type="button" onClick={add} className="rounded bg-brand-blue px-1.5 py-0.5 text-[10px] text-white">添加</button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto max-h-[360px]">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition ${
                selected?.id === item.id ? 'border-brand-blue bg-brand-blue/10 text-brand-blue' : 'border-border hover:bg-accent/50'
              }`}
            >
              <div className="truncate font-medium">{item.name}</div>
              <div className="text-[9px] text-muted-foreground truncate">{item.id}</div>
            </button>
          ))}
          {items.length === 0 && <p className="text-[10px] text-muted-foreground">暂无项</p>}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{selected.name}</h4>
              <button type="button" onClick={() => remove(selected.id)} className="text-[11px] text-destructive hover:underline">删除</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="ID" value={selected.id} onChange={(v) => patch({ id: v } as Partial<T>)} />
              <TextField label="名称" value={selected.name} onChange={(v) => patch({ name: v } as Partial<T>)} />
            </div>
            {renderForm(selected, patch)}
            {renderPreview?.(selected)}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">点击左侧添加{title}</p>
        )}
      </div>
    </div>
  );
}