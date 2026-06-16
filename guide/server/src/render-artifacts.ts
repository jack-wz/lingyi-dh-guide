import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDataDir } from './db/database.js';

export type RenderArtifactJob = {
  id: string;
  output_url?: string | null;
};

export function removeRenderArtifacts(job: RenderArtifactJob) {
  const rendersDir = resolve(getDataDir(), 'renders');
  const candidates = [resolve(rendersDir, `job_${job.id}`)];

  if (job.output_url && typeof job.output_url === 'string') {
    if (job.output_url.startsWith('/renders/')) {
      candidates.push(resolve(getDataDir(), job.output_url.slice(1)));
    } else if (!/^https?:\/\//i.test(job.output_url)) {
      candidates.push(resolve(job.output_url));
    }
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith(`${rendersDir}/`)) continue;
    try {
      rmSync(candidate, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[Render] Failed to remove artifact ${candidate}:`, error);
    }
  }
}

export function removeRenderArtifactsForJobs(jobs: RenderArtifactJob[]) {
  for (const job of jobs) removeRenderArtifacts(job);
}
