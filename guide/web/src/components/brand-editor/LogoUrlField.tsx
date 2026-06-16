import { useState } from 'react';
import FileUploader from '../FileUploader';
import MediaLogoPickerModal from './MediaLogoPickerModal';

interface Props {
  label: string;
  value?: string;
  onChange: (url: string, meta?: { name?: string; assetId?: string }) => void;
}

export default function LogoUrlField({ label, value = '', onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <FileUploader
        label={label}
        value={value}
        onChange={(url) => onChange(url)}
        accept="image/*"
        placeholder="Logo 图片 URL"
        previewType="image"
      />
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="text-[10px] text-brand-blue hover:underline"
      >
        从媒体库选择
      </button>
      <MediaLogoPickerModal
        open={pickerOpen}
        title={`${label} · 媒体库`}
        onClose={() => setPickerOpen(false)}
        onSelect={(asset) => onChange(asset.url, { name: asset.name, assetId: asset.id })}
      />
    </div>
  );
}