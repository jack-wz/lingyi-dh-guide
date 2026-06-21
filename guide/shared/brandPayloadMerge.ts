/** Merge library brand payload updates; `null` in patch deletes keys from the result. */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function walkNullDeletions(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete target[key];
      continue;
    }
    if (!isPlainObject(value)) continue;
    const child = target[key];
    if (isPlainObject(child)) {
      walkNullDeletions(child, value);
    }
  }
}

export function applyPayloadNullDeletions(
  merged: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = structuredClone(merged) as Record<string, unknown>;
  walkNullDeletions(next, patch);
  return next;
}

export function mergeBrandPayloadPatch(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return applyPayloadNullDeletions({ ...base, ...patch }, patch);
}