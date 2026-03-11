import { DisplayRenderer, PersonaId } from './types';
import { TerminalRenderer } from './terminal-renderer';
import { WebRenderer } from './web-renderer';
import { createLcdRenderer } from './lcd-renderer';

/**
 * Fans out render calls to multiple backends.
 */
class CompositeRenderer implements DisplayRenderer {
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
 * - Always starts a web preview server with persona-specific color
 * - On Raspberry Pi: uses ST7789V LCD if spi-device is available
 * - Falls back to terminal renderer on non-Pi hardware
 * - FORCE_TERMINAL=1 env forces terminal mode
 */
export function createRenderer(personaId?: string): DisplayRenderer {
  const renderers: DisplayRenderer[] = [];
  const pid = (personaId || 'echo') as PersonaId;

  const web = new WebRenderer(pid);
  renderers.push(web);

  if (process.env.FORCE_TERMINAL === '1') {
    renderers.push(new TerminalRenderer());
    return new CompositeRenderer(renderers);
  }

  // Try ST7789V LCD (Raspberry Pi with Waveshare 2" display)
  const lcd = createLcdRenderer(pid);
  if (lcd) {
    console.log('Waveshare LCD detected on SPI bus');
    renderers.push(lcd);
  } else {
    renderers.push(new TerminalRenderer());
  }

  return new CompositeRenderer(renderers);
}
