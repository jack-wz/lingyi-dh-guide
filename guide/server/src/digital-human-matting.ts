import { existsSync, mkdirSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { spawnSync } from 'child_process';

/** Remove portrait background with HyperFrames u2net (opentalking-style cutout for scene compositing). */
export function mattingDigitalHumanImage(
  srcPath: string,
  outputPath?: string,
): { ok: boolean; outputPath: string; error?: string } {
  if (!existsSync(srcPath)) {
    return { ok: false, outputPath: outputPath || '', error: `Source not found: ${srcPath}` };
  }

  const dest = outputPath || join(
    dirname(srcPath),
    `${basename(srcPath, extname(srcPath))}_cutout.png`,
  );
  mkdirSync(dirname(dest), { recursive: true });

  if (existsSync(dest)) {
    return { ok: true, outputPath: dest };
  }

  const result = spawnSync(
    'npx',
    ['hyperframes', 'remove-background', srcPath, '-o', dest],
    { encoding: 'utf-8', timeout: 300_000 },
  );

  if (result.status !== 0 || !existsSync(dest)) {
    const stderr = (result.stderr || result.stdout || '').trim();
    return {
      ok: false,
      outputPath: dest,
      error: stderr || `Matting failed with exit ${result.status ?? 'unknown'}`,
    };
  }

  return { ok: true, outputPath: dest };
}

export function cutoutUrlFromPhotoUrl(photoUrl: string): string {
  const normalized = String(photoUrl || '').trim();
  if (!normalized) return '';
  const ext = extname(normalized);
  if (!ext) return `${normalized}_cutout.png`;
  return normalized.replace(new RegExp(`${ext.replace('.', '\\.')}$`), '_cutout.png');
}