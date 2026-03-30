import type { DisplayRenderer } from './types';

const I2C_ADDR = 0x3c;
const I2C_BUS = 1;
const CHUNK_SIZE = 16;

// SSD1306 init sequence
const INIT_CMDS = [
  0xae, // display off
  0xd5,
  0x80, // set clock div
  0xa8,
  0x3f, // set multiplex (64-1)
  0xd3,
  0x00, // set display offset
  0x40, // set start line 0
  0x8d,
  0x14, // charge pump on
  0x20,
  0x00, // horizontal addressing mode
  0xa1, // segment remap (col 127 = SEG0)
  0xc8, // COM output scan direction remapped
  0xda,
  0x12, // set COM pins
  0x81,
  0xcf, // set contrast
  0xd9,
  0xf1, // set precharge
  0xdb,
  0x40, // set VCOMH deselect level
  0xa4, // display from RAM
  0xa6, // normal display (not inverted)
  0xaf, // display on
];

export interface OledRenderer extends DisplayRenderer {
  render(buffer: Uint8Array): void;
  stop(): void;
}

/**
 * Try to create an OLED renderer for SSD1306 over I2C.
 * Returns null if i2c-bus is not installed or the bus can't be opened.
 */
export function createOledRenderer(): OledRenderer | null {
  let i2cBus: any;
  try {
    i2cBus = require('i2c-bus');
  } catch {
    return null;
  }

  let bus: any;
  try {
    bus = i2cBus.openSync(I2C_BUS);
  } catch {
    return null;
  }

  // Send init commands
  try {
    for (const cmd of INIT_CMDS) {
      bus.writeByteSync(I2C_ADDR, 0x00, cmd);
    }
  } catch {
    try {
      bus.closeSync();
    } catch {
      /* ignore */
    }
    return null;
  }

  return {
    render(buffer: Uint8Array): void {
      try {
        // Set column address range 0-127
        bus.writeByteSync(I2C_ADDR, 0x00, 0x21);
        bus.writeByteSync(I2C_ADDR, 0x00, 0x00);
        bus.writeByteSync(I2C_ADDR, 0x00, 0x7f);
        // Set page address range 0-7
        bus.writeByteSync(I2C_ADDR, 0x00, 0x22);
        bus.writeByteSync(I2C_ADDR, 0x00, 0x00);
        bus.writeByteSync(I2C_ADDR, 0x00, 0x07);

        // Write display data in chunks
        for (let i = 0; i < 1024; i += CHUNK_SIZE) {
          const chunk = Buffer.alloc(CHUNK_SIZE + 1);
          chunk[0] = 0x40; // Co=0, D/C#=1 (data)
          for (let j = 0; j < CHUNK_SIZE && i + j < 1024; j++) {
            chunk[j + 1] = buffer[i + j];
          }
          bus.i2cWriteSync(I2C_ADDR, chunk.length, chunk);
        }
      } catch {
        // silently fail on I2C errors during render
      }
    },

    stop(): void {
      try {
        // Display off
        bus.writeByteSync(I2C_ADDR, 0x00, 0xae);
        bus.closeSync();
      } catch {
        // ignore
      }
    },
  };
}
