import { parseConfidenceMarker, stripAnsi } from '@parallaxai/confidence';

/**
 * The structured tail every reviewer is instructed to emit. Shared by the
 * `agent` verify oracle and the workflow `review` step so both parse the
 * same protocol.
 */
export const REVIEW_PROTOCOL_INSTRUCTION =
  'End your review with exactly two lines:\n' +
  'VERDICT: approve | revise | reject\n' +
  'CONFIDENCE: <0.0-1.0> — your confidence that the work fully satisfies the task';

export type ReviewVerdictWord = 'approve' | 'revise' | 'reject';

export interface ReviewVerdict {
  /** Final confidence score; undefined when nothing parseable was found. */
  confidence?: number;
  verdict?: ReviewVerdictWord;
  /** Readable tail of the review for detail/critique threading. */
  detail: string;
}

/**
 * Parse a reviewer's verdict from free text.
 *
 * The LAST `VERDICT:` marker wins (reviewers may quote the instruction);
 * `accept` is tolerated as an alias for `approve`. The numeric
 * `CONFIDENCE:` marker is the score, clamped by the verdict word so a
 * contradictory pair ("reject" + 0.9 — reviewers sometimes report
 * confidence in their *verdict* rather than the work) can never sneak a
 * rejected result past the accept threshold:
 *
 *   approve → marker, default 0.9
 *   revise  → min(marker, 0.6), default 0.5
 *   reject  → min(marker, 0.3), default 0.1
 *
 * No verdict word: the bare marker is used as-is. Nothing parseable:
 * confidence is undefined — callers decide the fallback.
 */
export function parseReviewVerdict(text: string): ReviewVerdict {
  const clean = stripAnsi(text ?? '').trim();
  const detail = clean.slice(-1200);

  const matches = clean.match(/verdict:\s*(approve|accept|revise|reject)/gi);
  const last = matches?.[matches.length - 1];
  const word = last
    ? (last
        .replace(/verdict:\s*/i, '')
        .toLowerCase()
        .replace('accept', 'approve') as ReviewVerdictWord)
    : undefined;

  const marker = parseConfidenceMarker(clean);

  let confidence: number | undefined;
  switch (word) {
    case 'approve':
      confidence = marker ?? 0.9;
      break;
    case 'revise':
      confidence = Math.min(marker ?? 0.5, 0.6);
      break;
    case 'reject':
      confidence = Math.min(marker ?? 0.1, 0.3);
      break;
    default:
      confidence = marker;
  }

  return { confidence, verdict: word, detail };
}
