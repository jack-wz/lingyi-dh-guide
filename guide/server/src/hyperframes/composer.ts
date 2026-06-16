export { generateHyperframesHTML, HYPERFRAMES_RUNTIME_URL } from '@shared/hyperframesComposer';
import { generateHyperframesHTML } from '@shared/hyperframesComposer';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

interface Segment {
  id: string;
  type: string;
  narration_text: string;
  duration_sec: number;
  scene_image_url: string;
  scene_description: string;
  camera_shot: string;
  subtitle: { enabled: boolean; style_id: string; position: string; animation: string };
  transition: { type: string; duration: number };
  digital_human: { enabled: boolean; position: { x: number; y: number }; scale: number };
  overlays: Array<Record<string, unknown>>;
}

interface DSL {
  meta: { name: string; type: string; [key: string]: unknown };
  globalConfig: Record<string, unknown>;
  segments: Segment[];
}

export function writeHyperframesComposition(dsl: DSL, outputDir: string, resolvedSegments?: Segment[]): string {
  mkdirSync(outputDir, { recursive: true });
  const html = generateHyperframesHTML(dsl as Parameters<typeof generateHyperframesHTML>[0], resolvedSegments as Parameters<typeof generateHyperframesHTML>[1]);
  const htmlPath = join(outputDir, 'index.html');
  writeFileSync(htmlPath, html, 'utf-8');
  return htmlPath;
}