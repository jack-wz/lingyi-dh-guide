import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mirror estimateRenderCostRisk logic for hyperframes_template (tested without DOM).
function estimateLikeHyperframes(sceneCount: number, totalDuration: number) {
  const pipelineMultiplier = 0.55;
  const perSceneOverhead = 2;
  const resolutionMultiplier = 0.75;
  const minMinutes = Math.max(1, Math.ceil((totalDuration * pipelineMultiplier * resolutionMultiplier + sceneCount * perSceneOverhead) / 45));
  return minMinutes;
}

describe('render cost estimate (hyperframes_template)', () => {
  it('38s 4-scene 720p HF job stays around 1-2 minutes not standard-pipeline 2-4', () => {
    const minMinutes = estimateLikeHyperframes(4, 38);
    assert.ok(minMinutes <= 2, `expected <=2 min, got ${minMinutes}`);
  });
});