import { describe, expect, it } from 'vitest';
import { parseReviewVerdict } from '../review-verdict';

describe('parseReviewVerdict', () => {
  it('parses approve with a confidence marker', () => {
    const v = parseReviewVerdict(
      'Looks solid, composition verified.\nVERDICT: approve\nCONFIDENCE: 0.95'
    );
    expect(v.verdict).toBe('approve');
    expect(v.confidence).toBe(0.95);
  });

  it('defaults approve to 0.9 without a marker', () => {
    expect(parseReviewVerdict('VERDICT: approve').confidence).toBe(0.9);
  });

  it('clamps a contradictory reject + high marker to 0.3', () => {
    // Reviewers sometimes report confidence in their VERDICT rather than
    // the work — a rejected result must never pass the accept threshold.
    const v = parseReviewVerdict('VERDICT: reject\nCONFIDENCE: 0.9');
    expect(v.verdict).toBe('reject');
    expect(v.confidence).toBe(0.3);
  });

  it('reject defaults to 0.1; revise clamps to 0.6', () => {
    expect(parseReviewVerdict('VERDICT: reject').confidence).toBe(0.1);
    expect(
      parseReviewVerdict('VERDICT: revise\nCONFIDENCE: 0.8').confidence
    ).toBe(0.6);
    expect(parseReviewVerdict('VERDICT: revise').confidence).toBe(0.5);
  });

  it('last verdict wins when the instruction is quoted', () => {
    const v = parseReviewVerdict(
      'The format is "VERDICT: approve | revise | reject".\n' +
        'After verifying: the halves do not compose.\nVERDICT: reject\nCONFIDENCE: 0.15'
    );
    expect(v.verdict).toBe('reject');
    expect(v.confidence).toBe(0.15);
  });

  it('tolerates accept as an alias for approve', () => {
    expect(parseReviewVerdict('VERDICT: accept').verdict).toBe('approve');
  });

  it('bare confidence marker without a verdict word passes through', () => {
    const v = parseReviewVerdict('All good. CONFIDENCE: 0.7');
    expect(v.verdict).toBeUndefined();
    expect(v.confidence).toBe(0.7);
  });

  it('returns undefined confidence when nothing is parseable', () => {
    const v = parseReviewVerdict('I looked at it, seems fine I guess.');
    expect(v.confidence).toBeUndefined();
    expect(v.verdict).toBeUndefined();
  });

  it('parses through raw TUI frames', () => {
    const v = parseReviewVerdict(
      '\x1b[38;2;1;2;3mDone.\x1b[39m\r\nVERDICT:\x1b[2C reject\nCONFIDENCE: 0.2\x1b[K'
    );
    expect(v.verdict).toBe('reject');
    expect(v.confidence).toBe(0.2);
  });
});
