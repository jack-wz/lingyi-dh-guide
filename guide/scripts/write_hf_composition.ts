import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolveCompositionDsl } from '../shared/compositionResolver';
import { generateHyperframesHTML } from '../shared/hyperframesComposer';

const dslPath = process.argv[2];
const outputDir = process.argv[3];
const variablesPath = process.argv[4];
const styleLayerBaseVideo = process.argv[5];

if (!dslPath || !outputDir) {
  console.error('Usage: npx tsx write_hf_composition.ts <dsl.json> <output-dir> [variables.json] [base-video-for-style-layer]');
  process.exit(1);
}

const dsl = JSON.parse(readFileSync(dslPath, 'utf-8'));
let variables: Record<string, string> = {};
if (variablesPath) {
  variables = JSON.parse(readFileSync(variablesPath, 'utf-8'));
}

const { dsl: resolved, segments } = resolveCompositionDsl(dsl, variables);
mkdirSync(outputDir, { recursive: true });
const composeOptions = styleLayerBaseVideo
  ? { mode: 'style_layer' as const, baseVideoUrl: styleLayerBaseVideo }
  : undefined;
writeFileSync(
  join(outputDir, 'index.html'),
  generateHyperframesHTML(resolved, segments, composeOptions),
  'utf-8',
);
console.log(join(outputDir, 'index.html'));