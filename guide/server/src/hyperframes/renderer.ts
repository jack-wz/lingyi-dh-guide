import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

interface RenderOptions {
  compositionDir: string;
  outputPath: string;
  fps?: number;
}

export function renderWithHyperframes(options: RenderOptions): boolean {
  const { compositionDir, outputPath, fps = 30 } = options;
  const htmlPath = join(compositionDir, 'index.html');

  if (!existsSync(htmlPath)) {
    console.error(`[HyperFrames] Composition not found: ${htmlPath}`);
    return false;
  }

  try {
    console.log(`[HyperFrames] Rendering ${htmlPath} -> ${outputPath}`);

    execSync(
      `npx hyperframes render --input "${htmlPath}" --output "${outputPath}" --fps ${fps}`,
      { cwd: compositionDir, stdio: 'pipe', timeout: 300_000 },
    );

    if (existsSync(outputPath)) {
      console.log(`[HyperFrames] Render complete: ${outputPath}`);
      return true;
    }

    console.error(`[HyperFrames] Output not found: ${outputPath}`);
    return false;
  } catch (err: any) {
    console.error(`[HyperFrames] Render failed: ${err.message}`);
    return false;
  }
}

export function isHyperframesAvailable(): boolean {
  try {
    execSync('npx hyperframes --version', { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}
