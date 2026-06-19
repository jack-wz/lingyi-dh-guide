/** Resolve karaoke word timings for HyperFrames captions (TTS / phrase / heuristic). */

export interface CaptionWordTiming {
  text: string;
  start: number;
  end: number;
}

export interface ResolvedCaptionTiming {
  words: CaptionWordTiming[];
  visibleStart: number;
  visibleDuration: number;
  source: 'tts' | 'phrase' | 'heuristic';
}

export function splitCaptionWords(text: string): string[] {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    const parts = trimmed.split(/(?<=[，。！？、；：,.!?])/g).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
    return Array.from(trimmed).filter((ch) => !/\s/.test(ch));
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

export function buildCaptionWordTimings(
  words: string[],
  windowStart: number,
  windowDuration: number,
): CaptionWordTiming[] {
  if (!words.length) return [];
  const slice = Math.max(0.05, windowDuration / words.length);
  return words.map((text, index) => {
    const start = windowStart + index * slice;
    const end = start + slice * 0.85;
    return { text, start, end };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeWordTimings(
  timings: CaptionWordTiming[],
  clipDuration: number,
): CaptionWordTiming[] {
  const cleaned: CaptionWordTiming[] = [];
  for (const item of timings) {
    const text = String(item.text || '').trim();
    if (!text) continue;
    const start = clamp(Number(item.start) || 0, 0, Math.max(0, clipDuration - 0.05));
    let end = clamp(Number(item.end) || start + 0.08, start + 0.05, clipDuration);
    if (end <= start) end = Math.min(clipDuration, start + 0.08);
    cleaned.push({ text, start, end });
  }
  return cleaned;
}

function subdividePhraseTimings(
  phraseTimings: CaptionWordTiming[],
  clipStart: number,
  clipDuration: number,
): CaptionWordTiming[] {
  const words: CaptionWordTiming[] = [];
  for (const phrase of phraseTimings) {
    const text = String(phrase.text || '').trim();
    if (!text) continue;
    const phraseStart = clamp((Number(phrase.start) || 0) - clipStart, 0, clipDuration);
    const phraseEnd = clamp((Number(phrase.end) || phraseStart) - clipStart, phraseStart + 0.05, clipDuration);
    const units = splitCaptionWords(text);
    if (!units.length) continue;
    const span = Math.max(0.08, phraseEnd - phraseStart);
    const slice = span / units.length;
    units.forEach((unit, index) => {
      const start = phraseStart + index * slice;
      const end = Math.min(clipDuration, start + slice * 0.9);
      words.push({ text: unit, start, end });
    });
  }
  return words;
}

function deriveVisibleWindow(words: CaptionWordTiming[], clipDuration: number): {
  visibleStart: number;
  visibleDuration: number;
} {
  if (!words.length) {
    return { visibleStart: 0.25, visibleDuration: Math.max(0.4, clipDuration - 0.35) };
  }
  const first = words[0].start;
  const last = words[words.length - 1].end;
  const visibleStart = clamp(Math.min(0.25, first), 0, Math.max(0, clipDuration - 0.2));
  const visibleDuration = clamp(last - visibleStart + 0.15, 0.4, clipDuration - visibleStart);
  return { visibleStart, visibleDuration };
}

export function resolveCaptionWordTimings(input: {
  text: string;
  clipDuration: number;
  clipStart?: number;
  wordTimings?: CaptionWordTiming[];
  phraseTimings?: CaptionWordTiming[];
  leadIn?: number;
}): ResolvedCaptionTiming {
  const clipDuration = Math.max(0.1, Number(input.clipDuration) || 5);
  const leadIn = Number.isFinite(input.leadIn) ? Number(input.leadIn) : 0.25;

  const presetWords = sanitizeWordTimings(input.wordTimings || [], clipDuration);
  if (presetWords.length >= 1) {
    const window = deriveVisibleWindow(presetWords, clipDuration);
    return { words: presetWords, ...window, source: 'tts' };
  }

  const phraseWords = subdividePhraseTimings(
    input.phraseTimings || [],
    Number(input.clipStart) || 0,
    clipDuration,
  );
  if (phraseWords.length >= 1) {
    const window = deriveVisibleWindow(phraseWords, clipDuration);
    return { words: phraseWords, ...window, source: 'phrase' };
  }

  const units = splitCaptionWords(input.text);
  const visibleStart = leadIn;
  const visibleDuration = Math.max(0.4, clipDuration - leadIn - 0.1);
  const words = buildCaptionWordTimings(units, visibleStart, visibleDuration);
  return { words, visibleStart, visibleDuration, source: 'heuristic' };
}

export function segmentUsesTtsWordTimings(seg: {
  subtitle?: { hf_params?: { word_timing_source?: string; word_timings?: CaptionWordTiming[] } };
}): boolean {
  const source = seg.subtitle?.hf_params?.word_timing_source;
  if (source === 'whisper' || source === 'tts') return true;
  return Boolean(seg.subtitle?.hf_params?.word_timings?.length);
}