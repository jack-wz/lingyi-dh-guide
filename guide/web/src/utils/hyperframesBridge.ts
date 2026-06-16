export interface HyperframesPlayerAdapter {
  getDuration: () => number;
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  isPlaying?: () => boolean;
}

function stageDuration(iframe: HTMLIFrameElement | null): number {
  const stage = iframe?.contentDocument?.getElementById('stage');
  const raw = stage?.getAttribute('data-duration');
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function hasHyperframesRuntime(iframe: HTMLIFrameElement | null): boolean {
  const win = iframe?.contentWindow as (Window & {
    __player?: HyperframesPlayerAdapter;
    __hf?: { seek?: (time: number) => void };
  }) | null;
  return Boolean(win?.__player?.seek || win?.__hf?.seek);
}

/** Preview DOM is ready (static frame visible). */
export function isHyperframesReady(iframe: HTMLIFrameElement | null): boolean {
  if (hasHyperframesRuntime(iframe)) return true;
  return stageDuration(iframe) > 0;
}

export function resolveHyperframesPlayer(iframe: HTMLIFrameElement | null): HyperframesPlayerAdapter | null {
  const win = iframe?.contentWindow as (Window & {
    __player?: HyperframesPlayerAdapter;
    __hf?: { seek?: (time: number) => void };
  }) | null;
  if (!win) return null;
  if (win.__player?.seek) return win.__player;
  const duration = stageDuration(iframe);
  if (win.__hf?.seek) {
    return {
      getDuration: () => duration,
      seek: (time) => win.__hf?.seek?.(time),
      play: () => undefined,
      pause: () => undefined,
    };
  }
  if (duration > 0) {
    return {
      getDuration: () => duration,
      seek: (time) => {
        try {
          win.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: Math.max(0, time) } }));
        } catch {
          /* ignore */
        }
      },
      play: () => undefined,
      pause: () => undefined,
    };
  }
  return null;
}

export function seekHyperframesIframe(iframe: HTMLIFrameElement | null, time: number): boolean {
  const player = resolveHyperframesPlayer(iframe);
  if (player?.seek) {
    player.seek(Math.max(0, time));
    return true;
  }
  const win = iframe?.contentWindow;
  if (!win) return false;
  try {
    win.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: Math.max(0, time) } }));
    return true;
  } catch {
    return false;
  }
}

export function waitForHyperframesPlayer(
  iframe: HTMLIFrameElement,
  timeoutMs = 4000,
): Promise<HyperframesPlayerAdapter | null> {
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (isHyperframesReady(iframe)) {
        resolve(resolveHyperframesPlayer(iframe));
        return;
      }
      if (performance.now() - started >= timeoutMs) {
        resolve(resolveHyperframesPlayer(iframe));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export function setHyperframesPlayback(iframe: HTMLIFrameElement | null, playing: boolean): void {
  const player = resolveHyperframesPlayer(iframe);
  if (!player) return;
  if (playing) player.play?.();
  else player.pause?.();
}