import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { generateHyperframesHTML } from '../shared/hyperframesComposer';

const dslPath = process.argv[2];
const outputDir = process.argv[3];

if (!dslPath || !outputDir) {
  console.error('Usage: npx tsx write_hf_composition.ts <dsl.json> <output-dir>');
  process.exit(1);
}

const dsl = JSON.parse(readFileSync(dslPath, 'utf-8'));
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'index.html'), generateHyperframesHTML(dsl), 'utf-8');
console.log(join(outputDir, 'index.html'));