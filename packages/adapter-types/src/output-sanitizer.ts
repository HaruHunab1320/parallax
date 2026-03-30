/**
 * Output Sanitizer
 *
 * Utilities for cleaning terminal output — stripping ANSI escape codes,
 * TUI chrome, box-drawing characters, and other noise that interferes
 * with text processing.
 *
 * Used by both pty-manager and tmux-manager for stall detection, task
 * completion detection, and output capture. Also used by the workflow
 * executor to clean step results before interpolating into subsequent tasks.
 */

export interface SanitizeOptions {
  /** Strip ANSI escape codes (SGR, cursor, etc). Default: true */
  stripAnsi?: boolean;
  /** Strip TUI box-drawing and decorative Unicode. Default: true */
  stripTuiChrome?: boolean;
  /** Strip OSC/DCS sequences (hyperlinks, window titles). Default: true */
  stripOsc?: boolean;
  /** Collapse multiple blank lines to at most 2. Default: true */
  collapseBlankLines?: boolean;
  /** Truncate to last N characters. 0 = no limit. Default: 0 */
  maxLength?: number;
}

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  stripAnsi: true,
  stripTuiChrome: true,
  stripOsc: true,
  collapseBlankLines: true,
  maxLength: 0,
};

/**
 * Sanitize terminal output for text processing.
 */
export function sanitizeOutput(
  raw: string,
  options?: SanitizeOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let result = raw;

  if (opts.stripOsc) {
    // Strip OSC sequences (Operating System Command)
    result = result.replace(
      /\x1b\](?:[^\x07\x1b]|\x1b[^\\])*(?:\x07|\x1b\\)/g,
      ''
    );
    // Strip DCS sequences (Device Control String)
    result = result.replace(/\x1bP(?:[^\x1b]|\x1b[^\\])*\x1b\\/g, '');
  }

  if (opts.stripAnsi) {
    // Replace cursor movement with spaces to preserve word boundaries
    result = result.replace(/\x1b\[\d*[CDABGdEF]/g, ' ');
    result = result.replace(/\x1b\[\d*(?:;\d+)?[Hf]/g, ' ');
    result = result.replace(/\x1b\[\d*[JK]/g, ' ');
    // Strip remaining ANSI escape sequences
    // eslint-disable-next-line no-control-regex
    result = result.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
    // Strip JSON-escaped ANSI (from serialized output)
    result = result.replace(/\\u001b\[[0-9;]*[a-zA-Z]/g, '');
    // Strip bare control characters (except tab and newline)
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  }

  if (opts.stripTuiChrome) {
    // Strip TUI box-drawing, spinner, and decorative Unicode
    result = result.replace(
      /[│╭╰╮╯─═╌║╔╗╚╝╠╣╦╩╬┌┐└┘├┤┬┴┼●○❯❮▶◀⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷✻✶✳✢⏺←→↑↓⬆⬇◆◇▪▫■□▲△▼▽◈⟨⟩⌘⏎⏏⌫⌦⇧⇪⌥▐▛▜▝▘]/g,
      ' '
    );
    // Normalize non-breaking spaces
    result = result.replace(/\xa0/g, ' ');
    // Collapse multiple spaces
    result = result.replace(/ {2,}/g, ' ');
  }

  if (opts.collapseBlankLines) {
    result = result.replace(/\n{3,}/g, '\n\n');
  }

  if (opts.maxLength > 0 && result.length > opts.maxLength) {
    result = result.slice(-opts.maxLength);
  }

  return result.trim();
}
