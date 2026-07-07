import type { DisplayRenderer } from './types';

/**
 * Terminal renderer using Unicode half-block characters.
 * Each terminal row represents 2 pixel rows → 32 rows for 64 pixels.
 * Uses ANSI cursor-home to redraw in place.
 */
export class TerminalRenderer implements DisplayRenderer {
  private started = false;

  render(buffer: Uint8Array): void {
    if (!this.started) {
      // Clear screen and hide cursor
      process.stdout.write('\x1B[2J\x1B[?25l');
      this.started = true;
    }

    // Cursor home
    process.stdout.write('\x1B[H');

    const lines: string[] = [];
    for (let row = 0; row < 64; row += 2) {
      let line = '';
      for (let col = 0; col < 128; col++) {
        const upper = getPixel(buffer, col, row);
        const lower = getPixel(buffer, col, row + 1);

        if (upper && lower) {
          line += '\u2588'; // █ full block
        } else if (upper) {
          line += '\u2580'; // ▀ upper half
        } else if (lower) {
          line += '\u2584'; // ▄ lower half
        } else {
          line += ' ';
        }
      }
      lines.push(line);
    }

    process.stdout.write(`${lines.join('\n')}\n`);
  }

  stop(): void {
    if (this.started) {
      // Show cursor again
      process.stdout.write('\x1B[?25h');
      this.started = false;
    }
  }
}

function getPixel(buffer: Uint8Array, x: number, y: number): boolean {
  const page = y >> 3;
  const bit = y & 7;
  return (buffer[page * 128 + x] & (1 << bit)) !== 0;
}
