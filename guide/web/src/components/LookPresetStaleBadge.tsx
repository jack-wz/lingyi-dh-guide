import { isLookPresetRegistryStale, LOOK_PRESET_REGISTRY_VERSION } from '@shared/lookPreset';

export default function LookPresetStaleBadge({
  registryVersion,
  testId,
  className = '',
}: {
  registryVersion?: string | null;
  testId?: string;
  className?: string;
}) {
  if (!isLookPresetRegistryStale(registryVersion)) return null;
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/15 text-amber-700 border border-amber-500/30 ${className}`}
      title={`预设基于旧版 HF 注册表，建议同步至 ${LOOK_PRESET_REGISTRY_VERSION}`}
    >
      需同步
    </span>
  );
}