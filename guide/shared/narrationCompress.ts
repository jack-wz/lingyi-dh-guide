const FILLER_PATTERNS = [
  /[；;]{2,}/g,
  /[，,]{2,}/g,
  /\.{2,}/g,
  /[—–]+/g,
  /也就是说[，,]?/g,
  /然后[，,]?/g,
  /那个[，,]?/g,
  /这个[，,]?/g,
  /嗯[，,]?/g,
  /啊[，,]?/g,
  /对吧[，,]?/g,
  /的话[，,]?/g,
  /其实吧[，,]?/g,
  /总的来说[，,]?/g,
  /综上所述[，,]?/g,
];

const REPEAT_PATTERN = /(.{2,8})\1{1,}/g;

function stripFillers(text: string): string {
  let result = text;
  for (const pattern of FILLER_PATTERNS) {
    result = result.replace(pattern, '');
  }
  result = result.replace(REPEAT_PATTERN, '$1');
  return result.trim();
}

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function mergeShortSentences(text: string): string {
  const sentences = text.split(/([。！？.!?])/g);
  const merged: string[] = [];
  let current = '';
  for (let i = 0; i < sentences.length; i++) {
    current += sentences[i];
    if (/[。！？.!?]/.test(sentences[i] || '')) {
      if (current.length >= 10 || i >= sentences.length - 1) {
        merged.push(current);
        current = '';
      }
    }
  }
  if (current) merged.push(current);
  return merged.join('');
}

export interface CompressOptions {
  target_chars_per_sec?: number;
  max_duration_sec?: number;
}

export interface CompressResult {
  original: string;
  compressed: string;
  original_chars: number;
  compressed_chars: number;
  reduction_pct: number;
  changes: string[];
}

const PROTECTED_PATTERNS = [
  /[\d]+[元块万亿]/g,
  /[满减打折优惠]/g,
  /[立即点击购买下单]/g,
  /[品牌商标]/g,
];

function extractProtected(text: string): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const pattern of PROTECTED_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const placeholder = `⟦P${idx++}⟧`;
      map.set(placeholder, match[0]);
    }
  }
  return map;
}

function protectText(text: string, map: Map<string, string>): string {
  let result = text;
  for (const [placeholder, original] of map) {
    result = result.replace(original, placeholder);
  }
  return result;
}

function unprotectText(text: string, map: Map<string, string>): string {
  let result = text;
  for (const [placeholder, original] of map) {
    result = result.replace(placeholder, original);
  }
  return result;
}

export function compressChineseNarration(
  text: string,
  options: CompressOptions = {},
): CompressResult {
  const changes: string[] = [];
  const protectedMap = extractProtected(text);
  let working = protectText(text, protectedMap);

  const afterFillers = stripFillers(working);
  if (afterFillers.length < working.length) {
    changes.push('removed filler words and repetitions');
    working = afterFillers;
  }

  const afterCollapse = collapseSpaces(working);
  if (afterCollapse.length < working.length) {
    changes.push('collapsed whitespace');
    working = afterCollapse;
  }

  const afterMerge = mergeShortSentences(working);
  if (afterMerge !== working) {
    changes.push('merged short sentences');
    working = afterMerge;
  }

  const compressed = unprotectText(working, protectedMap);
  const originalChars = text.replace(/\s/g, '').length;
  const compressedChars = compressed.replace(/\s/g, '').length;
  const reductionPct = originalChars > 0
    ? Math.round(((originalChars - compressedChars) / originalChars) * 100)
    : 0;

  return {
    original: text,
    compressed,
    original_chars: originalChars,
    compressed_chars: compressedChars,
    reduction_pct: reductionPct,
    changes,
  };
}

export function compressSegmentNarrations(
  segments: Array<{ narration_text?: string }>,
  options?: CompressOptions,
): Array<{ index: number; result: CompressResult }> {
  return segments.map((seg, index) => {
    const text = seg.narration_text || '';
    if (!text.trim()) return { index, result: { original: text, compressed: text, original_chars: 0, compressed_chars: 0, reduction_pct: 0, changes: [] } };
    return { index, result: compressChineseNarration(text, options) };
  });
}
