import type { Server } from 'node:http';
import type { DisplayRenderer, PersonaId } from './types';

/** Persona color schemes: [r, g, b] for "on" pixels */
const PERSONA_COLORS: Record<PersonaId, [number, number, number]> = {
  vero: [0, 255, 255], // cyan (#00ffff)
  silas: [255, 170, 0], // amber (#ffaa00)
  sable: [0, 255, 0], // green (#00ff00)
  echo: [224, 224, 255], // soft white (#e0e0ff)
};

const PERSONA_HEX: Record<PersonaId, string> = {
  vero: '#0ff',
  silas: '#fa0',
  sable: '#0f0',
  echo: '#e0e0ff',
};

const PERSONA_LABELS: Record<PersonaId, string> = {
  vero: 'Vero // Signal Architect',
  silas: 'Silas // Reality Hacker',
  sable: 'Sable // Knowledge Keeper',
  echo: 'Echo // System Weaver',
};

/**
 * Web renderer with persona-specific color.
 * Express SSE server with inline HTML canvas (4x scale).
 */
export class WebRenderer implements DisplayRenderer {
  private server: Server | null = null;
  private clients: Set<{ write: (data: string) => boolean }> = new Set();
  private port: number;
  private personaId: PersonaId;

  constructor(personaId: PersonaId, port?: number) {
    this.personaId = personaId;
    this.port = port || parseInt(process.env.DISPLAY_WEB_PORT || '3100', 10);
    this.startServer();
  }

  private startServer(): void {
    // Dynamic require to avoid hard dep at module level
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const express = require('express');
    const app = express();

    const color = PERSONA_COLORS[this.personaId];
    const hex = PERSONA_HEX[this.personaId];
    const label = PERSONA_LABELS[this.personaId];

    app.get('/', (_req: any, res: any) => {
      res.setHeader('Content-Type', 'text/html');
      res.send(buildHtmlPage(color, hex, label));
    });

    app.get('/frames', (req: any, res: any) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      this.clients.add(res);
      req.on('close', () => {
        this.clients.delete(res);
      });
    });

    this.server = app.listen(this.port, () => {
      console.log(`${label} display: http://localhost:${this.port}`);
    });
  }

  render(buffer: Uint8Array): void {
    if (this.clients.size === 0) return;
    const b64 = Buffer.from(buffer).toString('base64');
    const msg = `data: ${b64}\n\n`;
    for (const client of this.clients) {
      client.write(msg);
    }
  }

  stop(): void {
    for (const client of this.clients) {
      client.write('data: __close__\n\n');
    }
    this.clients.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

function buildHtmlPage(
  color: [number, number, number],
  hex: string,
  label: string
): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${label}</title>
<style>
  body { background: #1a1a2e; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: monospace; }
  canvas { border: 3px solid #333; border-radius: 8px; image-rendering: pixelated; background: #000; }
  .wrap { text-align: center; }
  h3 { color: ${hex}; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <h3>${label}</h3>
  <canvas id="c" width="512" height="256"></canvas>
</div>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const SCALE = 4;
const W = 128, H = 64;
const COLOR = [${color[0]}, ${color[1]}, ${color[2]}];

const es = new EventSource('/frames');
es.onmessage = (e) => {
  if (e.data === '__close__') { es.close(); return; }
  const raw = atob(e.data);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);

  const img = ctx.createImageData(W * SCALE, H * SCALE);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const page = y >> 3;
      const bit = y & 7;
      const on = (buf[page * W + x] & (1 << bit)) !== 0;
      const r = on ? COLOR[0] : 0;
      const g = on ? COLOR[1] : 0;
      const b = on ? COLOR[2] : 0;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const idx = ((y * SCALE + sy) * W * SCALE + (x * SCALE + sx)) * 4;
          img.data[idx] = r;
          img.data[idx+1] = g;
          img.data[idx+2] = b;
          img.data[idx+3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
};
</script>
</body>
</html>`;
}
