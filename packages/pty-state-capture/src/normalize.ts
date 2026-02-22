/**
 * ANSI-stripping and normalization for matcher-friendly text.
 *
 * Rules:
 * - Remove ANSI escape sequences.
 * - Replace cursor-forward CSI nC with spaces to preserve separation.
 * - Collapse repeated whitespace.
 */

const RE_CURSOR_FORWARD = /\x1b\[(\d+)C/g;
const RE_ANSI_CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const RE_ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const RE_ANSI_SINGLE = /\x1b[@-_]/g;

export function stripAnsiPreserveText(input: string): string {
  return input
    .replace(RE_CURSOR_FORWARD, (_match, n: string) => ' '.repeat(Math.max(Number.parseInt(n, 10) || 0, 0)))
    .replace(RE_ANSI_OSC, '')
    .replace(RE_ANSI_CSI, '')
    .replace(RE_ANSI_SINGLE, '');
}

export function normalizeForMatching(input: string): string {
  return stripAnsiPreserveText(input)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u2500-\u257f]/g, ' ') // box drawing
    .replace(/[\u2800-\u28ff]/g, ' ') // braille spinners
    .replace(/\s{2,}/g, ' ')
    .trim();
}
