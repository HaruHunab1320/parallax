import { drawString as fontDrawString } from './font';
import type { SpriteFrame } from './types';

/**
 * 128x64 frame buffer in SSD1306 page-column format.
 * 1024 bytes: 8 pages × 128 columns. Pixel (x,y) → byte page*128+x, bit y%8.
 */
export class FrameBuffer {
  readonly buffer: Uint8Array;
  readonly width = 128;
  readonly height = 64;

  constructor() {
    this.buffer = new Uint8Array(1024);
  }

  clear(): void {
    this.buffer.fill(0);
  }

  setPixel(x: number, y: number, on: boolean): void {
    if (x < 0 || x >= 128 || y < 0 || y >= 64) return;
    const page = y >> 3;
    const bit = y & 7;
    const idx = page * 128 + x;
    if (on) {
      this.buffer[idx] |= 1 << bit;
    } else {
      this.buffer[idx] &= ~(1 << bit);
    }
  }

  getPixel(x: number, y: number): boolean {
    if (x < 0 || x >= 128 || y < 0 || y >= 64) return false;
    const page = y >> 3;
    const bit = y & 7;
    return (this.buffer[page * 128 + x] & (1 << bit)) !== 0;
  }

  /**
   * Blit a sprite (row-major, MSB-first packed bits) onto the frame buffer.
   * Sprite bit order: byte 0 bit 7 = pixel (0,0), bit 6 = (1,0), etc.
   */
  blitSprite(sprite: SpriteFrame, dx: number, dy: number): void {
    const { data, width, height } = sprite;
    const bytesPerRow = Math.ceil(width / 8);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const byteIdx = row * bytesPerRow + (col >> 3);
        const bitIdx = 7 - (col & 7);
        if (data[byteIdx] & (1 << bitIdx)) {
          this.setPixel(dx + col, dy + row, true);
        }
      }
    }
  }

  /** Draw a text string using the 5x7 font. */
  drawString(text: string, x: number, y: number): void {
    fontDrawString(this.buffer, text, x, y);
  }

  /** Draw a dotted vertical line (every other pixel). */
  drawDottedVLine(x: number): void {
    for (let y = 0; y < 64; y += 2) {
      this.setPixel(x, y, true);
    }
  }
}
