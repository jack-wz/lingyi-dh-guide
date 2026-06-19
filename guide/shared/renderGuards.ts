/** Shared render validation helpers (editor + API). */

export const NARRATION_DH_PIPELINES = new Set(['standard', 'template_editor']);

export function dslHasNarration(dsl: { segments?: Array<{ narration_text?: string }> }): boolean {
  return (dsl.segments || []).some((seg) => String(seg.narration_text || '').trim());
}

export function jobWillHaveNarration(
  dsl: { segments?: Array<{ narration_text?: string }> },
  inputMode: string,
  topic: string,
  scriptText: string,
): boolean {
  if (inputMode === 'topic' && String(topic || '').trim()) {
    return true;
  }
  if (inputMode === 'script' && String(scriptText || '').trim()) {
    return true;
  }
  return dslHasNarration(dsl);
}

export function pipelineRequiresDhForNarration(pipelineKey: string): boolean {
  return NARRATION_DH_PIPELINES.has(pipelineKey);
}

export function narrationRequiresDigitalHumanIssue(
  pipelineKey: string,
  dsl: { segments?: Array<{ narration_text?: string }> },
  digitalHumanId: string,
  options: { inputMode?: string; topic?: string; scriptText?: string } = {},
): string | null {
  const inputMode = options.inputMode || 'template';
  const willNarrate = jobWillHaveNarration(
    dsl,
    inputMode,
    options.topic || '',
    options.scriptText || '',
  );
  if (!pipelineRequiresDhForNarration(pipelineKey) || !willNarrate) {
    return null;
  }
  if (String(digitalHumanId || '').trim()) {
    return null;
  }
  return '含口播分镜的标准流水线需选择数字人，以便绑定音色样本与 voice_clone_id 持久化';
}

export function getSegmentVoiceIdWarnings(
  dsl: { segments?: Array<{ voice_id?: string }> },
  selectedDhId: string,
): string[] {
  if (!String(selectedDhId || '').trim()) {
    return [];
  }
  const warnings: string[] = [];
  (dsl.segments || []).forEach((seg, index) => {
    const voiceId = String(seg.voice_id || '').trim();
    if (!voiceId) {
      return;
    }
    warnings.push(
      `分镜 ${index + 1} 设置了独立音色（${voiceId}），渲染时将忽略，统一使用所选数字人的 voice_clone_id`,
    );
  });
  return warnings;
}