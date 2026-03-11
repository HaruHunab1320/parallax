import { DisplayRenderer, PersonaId } from './types';
import { execSync } from 'child_process';

/**
 * Waveshare 2" ST7789V LCD renderer (240×320, SPI, RGB565).
 *
 * Takes the 128×64 monochrome frame buffer and renders it at 2× scale (256×128)
 * centered on a 320×240 landscape display, using the persona's signature color.
 *
 * Pin connections (Waveshare 2inch LCD):
 *   SPI0 CE0 (GPIO 8)  — CS   (Pin 24)
 *   GPIO 25             — DC   (Pin 22)
 *   GPIO 27             — RST  (Pin 13)
 *   GPIO 18             — BL   (Pin 12)
 */

// Display dimensions (landscape orientation)
const LCD_WIDTH = 320;
const LCD_HEIGHT = 240;

// Source dimensions
const SRC_WIDTH = 128;
const SRC_HEIGHT = 64;

// 2× integer scale
const SCALE = 2;
const SCALED_WIDTH = SRC_WIDTH * SCALE;   // 256
const SCALED_HEIGHT = SRC_HEIGHT * SCALE; // 128

// Center offset on 320×240
const OFFSET_X = Math.floor((LCD_WIDTH - SCALED_WIDTH) / 2);   // 32
const OFFSET_Y = Math.floor((LCD_HEIGHT - SCALED_HEIGHT) / 2); // 56

// GPIO pins
const GPIO_DC = 25;
const GPIO_RST = 27;
const GPIO_BL = 18;

// Persona colors as RGB565 (16-bit: RRRRR GGGGGG BBBBB)
const PERSONA_RGB565: Record<PersonaId, number> = {
  vero: rgb565(0, 255, 255),     // cyan
  silas: rgb565(255, 170, 0),    // amber
  sable: rgb565(0, 255, 0),      // green
  echo: rgb565(224, 224, 255),   // soft white
};

function rgb565(r: number, g: number, b: number): number {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

// ST7789V commands
const CMD = {
  SWRESET: 0x01,
  SLPOUT: 0x11,
  COLMOD: 0x3a,
  MADCTL: 0x36,
  CASET: 0x2a,
  RASET: 0x2b,
  RAMWR: 0x2c,
  INVON: 0x21,
  NORON: 0x13,
  DISPON: 0x29,
  DISPOFF: 0x28,
};

// MADCTL flags for landscape rotation (MX + MV)
const MADCTL_LANDSCAPE = 0x60;

/**
 * GPIO helper — uses Raspberry Pi's `pinctrl` tool.
 * Writes directly to GPIO registers and returns immediately (no blocking).
 * Works on all Pi models running modern Raspberry Pi OS (Bookworm/Trixie).
 */
class GpioPin {
  private pin: number;

  constructor(pin: number) {
    this.pin = pin;
    // Configure as output
    execSync(`pinctrl set ${pin} op`, { stdio: 'ignore' });
  }

  write(value: 0 | 1): void {
    execSync(`pinctrl set ${this.pin} ${value ? 'dh' : 'dl'}`, { stdio: 'ignore' });
  }
}

export interface LcdRenderer extends DisplayRenderer {
  render(buffer: Uint8Array): void;
  stop(): void;
}

/**
 * Try to create an LCD renderer for ST7789V over SPI.
 * Returns null if spi-device is not installed or SPI bus can't be opened.
 */
export function createLcdRenderer(personaId: PersonaId): LcdRenderer | null {
  let SPI: any;
  try {
    SPI = require('spi-device');
  } catch {
    return null;
  }

  let spi: any;

  try {
    // Open SPI0, CE0 at 40MHz
    spi = SPI.openSync(0, 0, {
      mode: SPI.MODE0,
      maxSpeedHz: 40_000_000,
    });

    // Verify pinctrl is available (Raspberry Pi GPIO tool)
    execSync('which pinctrl', { stdio: 'ignore' });
  } catch (err) {
    console.error('LCD init failed (SPI/GPIO):', err);
    return null;
  }

  const dcPin = new GpioPin(GPIO_DC);
  const rstPin = new GpioPin(GPIO_RST);
  const blPin = new GpioPin(GPIO_BL);

  const fgColor = PERSONA_RGB565[personaId] || PERSONA_RGB565.echo;
  const bgColor = rgb565(0, 0, 0); // black background

  // Pre-allocate full-screen RGB565 buffer (320×240 × 2 bytes)
  const screenBuf = Buffer.alloc(LCD_WIDTH * LCD_HEIGHT * 2);

  // Fill with background color
  function fillBackground(): void {
    const hi = (bgColor >> 8) & 0xff;
    const lo = bgColor & 0xff;
    for (let i = 0; i < screenBuf.length; i += 2) {
      screenBuf[i] = hi;
      screenBuf[i + 1] = lo;
    }
  }

  function sendCommand(cmd: number, data?: number[]): void {
    dcPin.write(0);
    const cmdBuf = Buffer.from([cmd]);
    spi.transferSync([{ sendBuffer: cmdBuf, byteLength: 1 }]);

    if (data && data.length > 0) {
      dcPin.write(1);
      const dataBuf = Buffer.from(data);
      spi.transferSync([{ sendBuffer: dataBuf, byteLength: dataBuf.length }]);
    }
  }

  function sendData(buf: Buffer): void {
    dcPin.write(1);
    // Send in 4096-byte chunks (SPI transfer limit)
    const CHUNK = 4096;
    for (let i = 0; i < buf.length; i += CHUNK) {
      const end = Math.min(i + CHUNK, buf.length);
      const chunk = buf.subarray(i, end);
      spi.transferSync([{ sendBuffer: chunk, byteLength: chunk.length }]);
    }
  }

  function sleep(ms: number): void {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* busy wait */ }
  }

  // --- Hardware reset ---
  rstPin.write(1);
  sleep(10);
  rstPin.write(0);
  sleep(10);
  rstPin.write(1);
  sleep(120);

  // --- ST7789V init sequence ---
  sendCommand(CMD.SWRESET);
  sleep(150);

  sendCommand(CMD.SLPOUT);
  sleep(120);

  // Pixel format: 16-bit RGB565
  sendCommand(CMD.COLMOD, [0x55]);
  sleep(10);

  // Memory access: landscape rotation
  sendCommand(CMD.MADCTL, [MADCTL_LANDSCAPE]);

  // Inversion on (ST7789V requires this for correct colors)
  sendCommand(CMD.INVON);
  sleep(10);

  // Normal display mode
  sendCommand(CMD.NORON);
  sleep(10);

  // Display on
  sendCommand(CMD.DISPON);
  sleep(10);

  // Backlight on
  blPin.write(1);

  // Set window to full screen
  sendCommand(CMD.CASET, [0x00, 0x00, (LCD_WIDTH - 1) >> 8, (LCD_WIDTH - 1) & 0xff]);
  sendCommand(CMD.RASET, [0x00, 0x00, (LCD_HEIGHT - 1) >> 8, (LCD_HEIGHT - 1) & 0xff]);

  console.log(`ST7789V LCD initialized (${personaId} — ${LCD_WIDTH}×${LCD_HEIGHT} landscape)`);

  return {
    render(buffer: Uint8Array): void {
      try {
        // Start with black background
        fillBackground();

        const fgHi = (fgColor >> 8) & 0xff;
        const fgLo = fgColor & 0xff;

        // Convert 128×64 monochrome (SSD1306 page-column format) → RGB565 at 2× scale
        for (let srcY = 0; srcY < SRC_HEIGHT; srcY++) {
          const page = srcY >> 3;
          const bit = srcY & 7;

          for (let srcX = 0; srcX < SRC_WIDTH; srcX++) {
            const on = (buffer[page * SRC_WIDTH + srcX] & (1 << bit)) !== 0;
            if (!on) continue;

            // Write 2×2 block of foreground color pixels
            for (let sy = 0; sy < SCALE; sy++) {
              const destY = OFFSET_Y + srcY * SCALE + sy;
              for (let sx = 0; sx < SCALE; sx++) {
                const destX = OFFSET_X + srcX * SCALE + sx;
                const idx = (destY * LCD_WIDTH + destX) * 2;
                screenBuf[idx] = fgHi;
                screenBuf[idx + 1] = fgLo;
              }
            }
          }
        }

        // Send to display
        sendCommand(CMD.RAMWR);
        sendData(screenBuf);
      } catch {
        // silently fail on SPI errors during render
      }
    },

    stop(): void {
      try {
        blPin.write(0);
        sendCommand(CMD.DISPOFF);
        spi.closeSync();
      } catch {
        // ignore
      }
    },
  };
}
