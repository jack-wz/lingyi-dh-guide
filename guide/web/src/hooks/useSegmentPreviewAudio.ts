import { useEffect, useRef } from 'react';

interface Options {
  previewUrl?: string;
  localTime: number;
  playing: boolean;
  muted?: boolean;
}

/** Sync editor segment preview TTS with timeline playhead. */
export function useSegmentPreviewAudio({
  previewUrl,
  localTime,
  playing,
  muted = false,
}: Options): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUrlRef = useRef('');

  useEffect(() => {
    if (!previewUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      lastUrlRef.current = '';
      return;
    }

    if (lastUrlRef.current !== previewUrl) {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(previewUrl);
      audio.preload = 'auto';
      audioRef.current = audio;
      lastUrlRef.current = previewUrl;
    }

    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = muted;

    if (playing) {
      if (Math.abs(audio.currentTime - localTime) > 0.2) {
        audio.currentTime = Math.max(0, localTime);
      }
      void audio.play().catch(() => undefined);
      return;
    }

    audio.pause();
    if (Math.abs(audio.currentTime - localTime) > 0.05) {
      audio.currentTime = Math.max(0, localTime);
    }
  }, [previewUrl, localTime, playing, muted]);

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);
}