import { DisplayRenderer } from './types';
import type { Server } from 'http';

/**
 * Web renderer: Express SSE server with inline HTML canvas (4x scale).
 * Broadcasts base64-encoded 1024-byte frames to all connected SSE clients.
 */
export class WebRenderer implements DisplayRenderer {
  private server: Server | null = null;
  private clients: Set<{ write: (data: string) => boolean }> = new Set();
  private port: number;

  constructor(port?: number) {
    this.port = port || parseInt(process.env.DISPLAY_WEB_PORT || '3100', 10);
    this.startServer();
  }

  private startServer(): void {
    // Dynamic require to avoid hard dep at module level
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const express = require('express');
    const app = express();

    app.get('/', (_req: any, res: any) => {
      res.setHeader('Content-Type', 'text/html');
      res.send(HTML_PAGE);
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
      console.log(`Tamagotchi web preview: http://localhost:${this.port}`);
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

const HTML_PAGE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Tamagotchi Display</title>
<style>
  body { background: #1a1a2e; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: monospace; }
  canvas { border: 3px solid #333; border-radius: 8px; image-rendering: pixelated; background: #000; }
  .wrap { text-align: center; }
  h3 { color: #0f0; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <h3>Pi 5 Tamagotchi</h3>
  <canvas id="c" width="512" height="256"></canvas>
</div>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const SCALE = 4;
const W = 128, H = 64;

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
      const r = on ? 0 : 0, g = on ? 255 : 0, b = on ? 0 : 0;
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
