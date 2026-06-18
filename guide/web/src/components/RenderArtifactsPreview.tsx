import { useCallback, useEffect, useState } from 'react';

type ArtifactFile = {
  name: string;
  url: string;
  exists: boolean;
  size_bytes: number;
  kind: string;
};

type SegmentArtifacts = {
  index: number;
  scene: ArtifactFile | null;
  clip: ArtifactFile | null;
  tts: ArtifactFile | null;
};

export type RenderArtifactsPayload = {
  job_id: string;
  work_dir: string;
  work_dir_exists: boolean;
  final: ArtifactFile | null;
  manifest: ArtifactFile | null;
  segments: SegmentArtifacts[];
  other_files: ArtifactFile[];
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function RenderArtifactsPreview({ jobId, refreshKey = 0 }: { jobId: string; refreshKey?: number }) {
  const [artifacts, setArtifacts] = useState<RenderArtifactsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/renders/${jobId}/artifacts`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setArtifacts(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
      setArtifacts(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!jobId) return null;

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3" data-testid="render-artifacts-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-foreground">分镜产物预览</h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="h-7 px-2.5 text-[11px] border border-border rounded-md hover:bg-secondary disabled:opacity-50"
        >
          {loading ? '刷新中…' : '刷新产物'}
        </button>
      </div>

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      {!loading && artifacts && !artifacts.work_dir_exists && (
        <p className="text-[12px] text-muted-foreground">工作目录尚未创建，等待 worker 开始处理…</p>
      )}

      {artifacts?.work_dir_exists && (
        <>
          {artifacts.final?.exists && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                成片 · {formatSize(artifacts.final.size_bytes)}
              </p>
              <video src={artifacts.final.url} controls className="w-full max-h-[280px] rounded-lg bg-black" />
            </div>
          )}

          {artifacts.segments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {artifacts.segments.map((seg) => (
                <div key={seg.index} className="rounded-md border border-border bg-card p-3 space-y-2">
                  <p className="text-[11px] font-medium text-foreground">分镜 {seg.index + 1}</p>
                  {seg.scene?.exists && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">场景图 · {formatSize(seg.scene.size_bytes)}</p>
                      <a href={seg.scene.url} target="_blank" rel="noreferrer">
                        <img src={seg.scene.url} alt={`scene ${seg.index}`} className="w-full max-h-40 object-contain rounded bg-black/5" />
                      </a>
                    </div>
                  )}
                  {seg.clip?.exists && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">分镜视频 · {formatSize(seg.clip.size_bytes)}</p>
                      <video src={seg.clip.url} controls className="w-full max-h-36 rounded bg-black" />
                    </div>
                  )}
                  {seg.tts?.exists && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">TTS · {formatSize(seg.tts.size_bytes)}</p>
                      <audio src={seg.tts.url} controls className="w-full h-8" />
                    </div>
                  )}
                  {!seg.scene?.exists && !seg.clip?.exists && !seg.tts?.exists && (
                    <p className="text-[11px] text-muted-foreground">暂无产物</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">尚无分镜文件（scene_*.png / clip_*.mp4）</p>
          )}
        </>
      )}
    </div>
  );
}