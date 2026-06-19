import { useRef, useState } from 'react';
import type { Segment } from '@shared/types/editor';
import { segmentUsesTtsWordTimings } from '@shared/captionWordTimings';
import { IconMic } from './Icons';

export interface TtsPreviewResult {
  audio_url: string;
  duration_sec: number;
  word_timings: Array<{ text: string; start: number; end: number }>;
  word_timing_source: 'whisper' | 'heuristic';
  tts_provider: string;
}

interface Props {
  text: string;
  segment: Segment;
  voiceId?: string;
  compact?: boolean;
  onApply: (patch: Partial<Segment>) => void;
}

export default function SegmentTtsPreview({
  text,
  segment,
  voiceId,
  compact = false,
  onApply,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastProvider, setLastProvider] = useState('');

  const previewUrl = segment.subtitle?.hf_params?.preview_audio_url;
  const hasTimings = segmentUsesTtsWordTimings(segment);
  const timingSource = segment.subtitle?.hf_params?.word_timing_source;

  const runPreview = async () => {
    const narration = text.trim();
    if (!narration) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tts/preview-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: narration,
          voice_id: voiceId || segment.voice_id || '',
        }),
      });
      const data = (await res.json()) as TtsPreviewResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || '试听失败');
      }
      setLastProvider(data.tts_provider);
      onApply({
        duration_sec: Math.max(1, Number(data.duration_sec) || segment.duration_sec || 5),
        subtitle: {
          ...segment.subtitle,
          hf_params: {
            ...segment.subtitle?.hf_params,
            word_timings: data.word_timings,
            word_timing_source: data.word_timing_source,
            preview_audio_url: data.audio_url,
          },
        },
      });
      if (audioRef.current) {
        audioRef.current.src = data.audio_url;
        void audioRef.current.play().catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '试听失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={compact ? 'mt-2' : 'mt-3 rounded-lg border border-border bg-secondary/20 p-3'}>
      <div className={`flex items-center gap-2 ${compact ? '' : 'mb-2'}`}>
        <button
          type="button"
          data-testid="segment-tts-preview"
          disabled={!text.trim() || loading}
          onClick={() => void runPreview()}
          className={`inline-flex items-center gap-1.5 rounded-md bg-brand-blue/10 px-2.5 py-1.5 text-[11px] font-medium text-brand-blue hover:bg-brand-blue/20 disabled:opacity-40 ${
            compact ? 'w-full justify-center' : ''
          }`}
        >
          <IconMic size={12} />
          {loading ? '合成对齐中…' : '试听并对齐词轴'}
        </button>
        {previewUrl && !compact && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline"
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.src = previewUrl;
                void audioRef.current.play().catch(() => undefined);
              }
            }}
          >
            重播
          </button>
        )}
      </div>
      {!compact && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {hasTimings
            ? `已绑定词级时间轴（${timingSource === 'whisper' ? 'Whisper' : '估算'}${lastProvider ? ` · ${lastProvider}` : ''}），卡拉 OK 预览将与配音同步。`
            : '生成预览配音并写入词级时间轴，HyperFrames 卡拉 OK 字幕可即时预览。'}
        </p>
      )}
      {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}
      <audio ref={audioRef} className="hidden" preload="none" />
    </div>
  );
}