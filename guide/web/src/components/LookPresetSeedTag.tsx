import { getLookPresetSeedPreviewTag } from '@shared/lookPresetSeedTags';

export default function LookPresetSeedTag({
  seedId,
  tagOverrides,
  testId,
  className = '',
}: {
  seedId?: string;
  tagOverrides?: Record<string, string> | null;
  testId?: string;
  className?: string;
}) {
  const label = getLookPresetSeedPreviewTag(seedId, tagOverrides);
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium bg-violet-100 text-violet-800 border border-violet-200 ${className}`.trim()}
      data-testid={testId || `look-preset-seed-tag-${seedId}`}
    >
      {label}
    </span>
  );
}