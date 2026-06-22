export const FEATURE_FLAGS = [
  'ENABLE_PROJECT_WORKFLOW',
  'ENABLE_PROPOSAL_GATE',
  'ENABLE_REFERENCE_SETS',
  'ENABLE_SEGMENT_REGEN',
  'ENABLE_LOTTIE_OVERLAY',
  'ENABLE_STAGE4_BUSINESS_QA',
  'ENABLE_REVIEW_WORKFLOW',
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

function readEnvFlag(name: string): boolean {
  const val = process.env[name];
  return val === '1' || val === 'true';
}

export function getFeatureFlags(): Record<FeatureFlag, boolean> {
  const result = {} as Record<FeatureFlag, boolean>;
  for (const flag of FEATURE_FLAGS) {
    result[flag] = readEnvFlag(flag);
  }
  return result;
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return readEnvFlag(flag);
}
