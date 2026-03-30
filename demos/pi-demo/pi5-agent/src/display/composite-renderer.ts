import { createOledRenderer } from './oled-renderer';
import { TerminalRenderer } from './terminal-renderer';
import type { DisplayRenderer } from './types';
import { WebRenderer } from './web-renderer';

/**
 * Fans out render calls to multiple backends.
 */
export class CompositeRenderer implements DisplayRenderer {
  private renderers: DisplayRenderer[];

  constructor(renderers: DisplayRenderer[]) {
    this.renderers = renderers;
  }

  render(buffer: Uint8Array): void {
    for (const r of this.renderers) {
      r.render(buffer);
    }
  }

  stop(): void {
    for (const r of this.renderers) {
      r.stop();
    }
  }
}

/**
 * Auto-detect available backends and create a composite renderer.
 * - Always starts a web preview server
 * - Uses physical OLED if i2c-bus is available and the bus opens
 * - Falls back to terminal renderer otherwise
 * - FORCE_TERMINAL=1 env forces terminal mode
 */
export function createRenderer(): DisplayRenderer {
  const renderers: DisplayRenderer[] = [];

  const web = new WebRenderer();
  renderers.push(web);

  if (process.env.FORCE_TERMINAL === '1') {
    renderers.push(new TerminalRenderer());
    return new CompositeRenderer(renderers);
  }

  const oled = createOledRenderer();
  if (oled) {
    console.log('OLED display detected on I2C bus');
    renderers.push(oled);
  } else {
    renderers.push(new TerminalRenderer());
  }

  return new CompositeRenderer(renderers);
}
