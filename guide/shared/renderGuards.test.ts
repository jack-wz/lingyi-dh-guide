import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dslHasNarration,
  getSegmentVoiceIdWarnings,
  narrationRequiresDigitalHumanIssue,
} from './renderGuards.js';

describe('renderGuards', () => {
  it('detects narration segments', () => {
    assert.equal(dslHasNarration({ segments: [{ narration_text: '  ' }, { narration_text: 'hi' }] }), true);
    assert.equal(dslHasNarration({ segments: [{ narration_text: '' }] }), false);
  });

  it('requires digital human for standard narration renders', () => {
    const dsl = { segments: [{ narration_text: '口播' }] };
    assert.equal(
      narrationRequiresDigitalHumanIssue('standard', dsl, ''),
      '含口播分镜的标准流水线需选择数字人，以便绑定音色样本与 voice_clone_id 持久化',
    );
    assert.equal(narrationRequiresDigitalHumanIssue('standard', dsl, 'dh_1'), null);
    assert.equal(narrationRequiresDigitalHumanIssue('digital_human', dsl, ''), null);
    assert.equal(narrationRequiresDigitalHumanIssue('standard', { segments: [] }, ''), null);
    assert.equal(
      narrationRequiresDigitalHumanIssue('standard', { segments: [] }, '', {
        inputMode: 'topic',
        topic: '新品发布',
      }),
      '含口播分镜的标准流水线需选择数字人，以便绑定音色样本与 voice_clone_id 持久化',
    );
    assert.equal(
      narrationRequiresDigitalHumanIssue('standard', { segments: [] }, 'dh_1', {
        inputMode: 'topic',
        topic: '新品发布',
      }),
      null,
    );
  });

  it('warns when segment voice_id is set alongside selected digital human', () => {
    const warnings = getSegmentVoiceIdWarnings(
      { segments: [{ voice_id: '' }, { voice_id: 'uspeech:abc' }] },
      'dh_test',
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /分镜 2/);
    assert.match(warnings[0], /uspeech:abc/);
  });
});