import type { FrameSnapshot, VTFrameOptions } from './types';

const CSI_START = /\x1b\[/y;
const OSC_START = /\x1b\]/y;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function padRight(value: string, minLength: number): string {
  if (value.length >= minLength) return value;
  return value + ' '.repeat(minLength - value.length);
}

function stripTrailingSpaces(value: string): string {
  return value.replace(/[ \t]+$/g, '');
}

function normalizeLines(lines: string[]): string[] {
  return lines.map((line) => stripTrailingSpaces(line));
}

export class VTFrame {
  private rows: number;
  private cols: number;
  private maxLines: number;
  private lines: string[];
  private cursorRow = 0;
  private cursorCol = 0;
  private altScreen = false;

  constructor(options: VTFrameOptions = {}) {
    this.rows = options.rows ?? 60;
    this.cols = options.cols ?? 200;
    this.maxLines = Math.max(options.maxLines ?? 2000, this.rows);
    this.lines = new Array(this.rows).fill('');
  }

  applyChunk(chunk: string): void {
    const input = chunk;
    let i = 0;

    while (i < input.length) {
      const ch = input[i];

      if (ch === '\x1b') {
        const consumed = this.consumeEscape(input, i);
        if (consumed > 0) {
          i += consumed;
          continue;
        }
      }

      switch (ch) {
        case '\n':
          this.cursorRow += 1;
          this.cursorCol = 0;
          this.ensureRow(this.cursorRow);
          i += 1;
          break;
        case '\r':
          this.cursorCol = 0;
          i += 1;
          break;
        case '\b':
          this.cursorCol = Math.max(0, this.cursorCol - 1);
          i += 1;
          break;
        case '\t': {
          const nextTab = this.cursorCol + (8 - (this.cursorCol % 8 || 8));
          this.cursorCol = clamp(nextTab, 0, this.cols - 1);
          i += 1;
          break;
        }
        default:
          this.writeChar(ch);
          i += 1;
          break;
      }
    }
  }

  snapshot(): FrameSnapshot {
    const trimmed = normalizeLines(this.lines);
    const visible = trimmed.filter((line) => line.length > 0);
    return {
      rows: this.rows,
      cols: this.cols,
      altScreen: this.altScreen,
      cursorRow: this.cursorRow,
      cursorCol: this.cursorCol,
      lines: trimmed,
      visibleText: visible.join('\n'),
    };
  }

  private ensureRow(targetRow: number): void {
    while (targetRow >= this.lines.length) {
      this.lines.push('');
    }

    if (this.lines.length > this.maxLines) {
      const overflow = this.lines.length - this.maxLines;
      this.lines.splice(0, overflow);
      this.cursorRow = Math.max(0, this.cursorRow - overflow);
    }

    this.cursorRow = clamp(this.cursorRow, 0, this.lines.length - 1);
  }

  private writeChar(ch: string): void {
    this.ensureRow(this.cursorRow);
    if (this.cursorCol >= this.cols) {
      this.cursorRow += 1;
      this.cursorCol = 0;
      this.ensureRow(this.cursorRow);
    }

    const row = this.lines[this.cursorRow] ?? '';
    const padded = padRight(row, this.cursorCol);
    const before = padded.slice(0, this.cursorCol);
    const after = padded.slice(this.cursorCol + 1);
    this.lines[this.cursorRow] = `${before}${ch}${after}`;
    this.cursorCol = clamp(this.cursorCol + 1, 0, this.cols);
  }

  private consumeEscape(input: string, index: number): number {
    CSI_START.lastIndex = index;
    OSC_START.lastIndex = index;

    if (CSI_START.test(input)) {
      const consumed = this.consumeCSI(input, index);
      return consumed;
    }

    if (OSC_START.test(input)) {
      const consumed = this.consumeOSC(input, index);
      return consumed;
    }

    if (input.startsWith('\x1b7', index) || input.startsWith('\x1b8', index)) {
      return 2;
    }

    if (input.startsWith('\x1b=', index) || input.startsWith('\x1b>', index)) {
      return 2;
    }

    return 1;
  }

  private consumeCSI(input: string, index: number): number {
    let i = index + 2;
    while (i < input.length) {
      const code = input.charCodeAt(i);
      if (code >= 0x40 && code <= 0x7e) {
        const final = input[i];
        const params = input.slice(index + 2, i);
        this.applyCSI(final, params);
        return i - index + 1;
      }
      i += 1;
    }
    return input.length - index;
  }

  private consumeOSC(input: string, index: number): number {
    let i = index + 2;
    while (i < input.length) {
      if (input[i] === '\x07') {
        return i - index + 1;
      }
      if (input[i] === '\x1b' && input[i + 1] === '\\') {
        return i - index + 2;
      }
      i += 1;
    }
    return input.length - index;
  }

  private applyCSI(final: string, paramRaw: string): void {
    if (final === 'h' || final === 'l') {
      if (paramRaw.includes('?1049')) {
        this.altScreen = final === 'h';
      }
      return;
    }

    const normalized = paramRaw.startsWith('?') ? paramRaw.slice(1) : paramRaw;
    const params = normalized.split(';').filter(Boolean).map((p) => Number.parseInt(p, 10));

    const p1 = Number.isFinite(params[0]) ? params[0] : 1;
    switch (final) {
      case 'A':
        this.cursorRow = Math.max(0, this.cursorRow - p1);
        return;
      case 'B':
        this.cursorRow += p1;
        this.ensureRow(this.cursorRow);
        return;
      case 'C':
        this.cursorCol = clamp(this.cursorCol + p1, 0, this.cols - 1);
        return;
      case 'D':
        this.cursorCol = Math.max(0, this.cursorCol - p1);
        return;
      case 'G':
        this.cursorCol = clamp((params[0] ?? 1) - 1, 0, this.cols - 1);
        return;
      case 'H':
      case 'f': {
        const row = clamp((params[0] ?? 1) - 1, 0, this.maxLines - 1);
        const col = clamp((params[1] ?? 1) - 1, 0, this.cols - 1);
        this.cursorRow = row;
        this.cursorCol = col;
        this.ensureRow(this.cursorRow);
        return;
      }
      case 'J':
        if ((params[0] ?? 0) === 2) {
          this.lines = new Array(this.rows).fill('');
          this.cursorRow = 0;
          this.cursorCol = 0;
        }
        return;
      case 'K': {
        this.ensureRow(this.cursorRow);
        const line = this.lines[this.cursorRow] ?? '';
        const mode = params[0] ?? 0;
        if (mode === 2) {
          this.lines[this.cursorRow] = '';
        } else if (mode === 1) {
          this.lines[this.cursorRow] = ' '.repeat(this.cursorCol) + line.slice(this.cursorCol);
        } else {
          this.lines[this.cursorRow] = line.slice(0, this.cursorCol);
        }
        return;
      }
      default:
        return;
    }
  }
}
