import type { DSL } from '../store/editorStore';
import { resolveCompositionDsl } from '@shared/compositionResolver';
import { generateHyperframesHTML, HYPERFRAMES_RUNTIME_URL } from '@shared/hyperframesComposer';

const EDITOR_RUNTIME_URL = '/api/hyperframes/runtime.js';

/** Build WYSIWYG HyperFrames HTML for in-editor live preview (same path as FFmpeg render). */
export function buildEditorPreviewHtml(dsl: DSL, variables: Record<string, string> = {}): string {
  const { dsl: resolved, segments } = resolveCompositionDsl(
    dsl as unknown as Parameters<typeof resolveCompositionDsl>[0],
    variables,
  );
  const html = generateHyperframesHTML(
    resolved as unknown as Parameters<typeof generateHyperframesHTML>[0],
    segments as unknown as Parameters<typeof generateHyperframesHTML>[1],
  );
  return html.replace(HYPERFRAMES_RUNTIME_URL, EDITOR_RUNTIME_URL);
}