import { useState, useRef } from 'react';

interface FileUploaderProps {
  value: string;
  onChange: (url: string) => void;
  accept?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  previewType?: 'image' | 'audio' | 'none';
}

export default function FileUploader({
  value,
  onChange,
  accept = 'image/*',
  label = '',
  placeholder = '点击上传或输入 URL',
  className = '',
  previewType = 'image',
}: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [inputMode, setInputMode] = useState<'upload' | 'url'>(value ? 'url' : 'upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`上传失败: ${res.statusText}`);
      const data = await res.json();
      onChange(data.url);
      setInputMode('url');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearFile = () => {
    onChange('');
    setError('');
    setInputMode('upload');
  };

  const showPreview = previewType === 'image' && value && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(value);
  const showAudioPreview = previewType === 'audio' && value && /\.(mp3|wav|m4a|ogg)(\?|$)/i.test(value);

  return (
    <div className={className}>
      {label && <label className="text-xs text-muted-foreground block mb-1">{label}</label>}

      <div className="flex gap-1 mb-1">
        <button
          type="button"
          onClick={() => setInputMode('upload')}
          className={`text-[10px] px-2 py-0.5 rounded ${inputMode === 'upload' ? 'bg-brand-blue/15 text-brand-blue' : 'text-muted-foreground hover:text-muted-foreground'}`}
        >
          上传
        </button>
        <button
          type="button"
          onClick={() => setInputMode('url')}
          className={`text-[10px] px-2 py-0.5 rounded ${inputMode === 'url' ? 'bg-brand-blue/15 text-brand-blue' : 'text-muted-foreground hover:text-muted-foreground'}`}
        >
          URL
        </button>
        {value && (
          <button type="button" onClick={clearFile} className="text-[10px] px-2 py-0.5 rounded text-destructive hover:text-destructive ml-auto">
            清除
          </button>
        )}
      </div>

      {inputMode === 'upload' ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-brand-blue hover:bg-brand-blue/5 transition"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileSelect}
            className="hidden"
          />
          {uploading ? (
            <span className="text-xs text-brand-blue">上传中...</span>
          ) : value ? (
            <span className="text-xs text-brand-green">已上传 ✓ 点击替换</span>
          ) : (
            <span className="text-xs text-muted-foreground">点击选择文件</span>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-border rounded px-2 py-1 text-xs"
        />
      )}

      {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}

      {showPreview && (
        <div className="mt-1 relative">
          <img src={value} alt="预览" className="w-full h-20 object-cover rounded border border-border" />
        </div>
      )}
      {showAudioPreview && (
        <div className="mt-1">
          <audio src={value} controls className="w-full h-8" />
        </div>
      )}
    </div>
  );
}
