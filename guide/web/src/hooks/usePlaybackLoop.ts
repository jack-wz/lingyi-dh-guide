import { useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';

/** Advance currentTime while playing; stops at end of timeline. */
export function usePlaybackLoop() {
  const playing = useEditorStore(s => s.playing);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const state = useEditorStore.getState();
      if (!state.playing) return;
      const dt = (now - last) / 1000;
      last = now;
      const total = state.getTotalDuration();
      const next = state.currentTime + dt;
      if (next >= total) {
        state.seekToTime(total, { syncSegment: true, clearSelection: false, stopPlayback: false });
        state.setPlaying(false);
        return;
      }
      state.seekToTime(next, { syncSegment: true, clearSelection: false, stopPlayback: false });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}