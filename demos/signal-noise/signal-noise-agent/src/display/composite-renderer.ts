import { DisplayRenderer, PersonaId } from './types';
import { TerminalRenderer } from './terminal-renderer';
import { WebRenderer } from './web-renderer';

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
 * - Falls back to terminal renderer (no OLED for signal-noise agents)
 * - FORCE_TERMINAL=1 env forces terminal mode
 */
export function createRenderer(personaId?: string): DisplayRenderer {
  const renderers: DisplayRenderer[] = [];
  const pid = (personaId || 'echo') as PersonaId;

  const web = new WebRenderer(pid);
  renderers.push(web);

  if (process.env.FORCE_TERMINAL === '1') {
    renderers.push(new TerminalRenderer());
  }

  if (renderers.length === 1) {
    return renderers[0];
  }

  return new CompositeRenderer(renderers);
}
