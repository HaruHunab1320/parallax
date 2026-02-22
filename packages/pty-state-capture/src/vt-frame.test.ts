import { describe, expect, it } from 'vitest';
import { VTFrame } from './vt-frame';

describe('VTFrame', () => {
  it('handles carriage-return redraw on same line', () => {
    const frame = new VTFrame({ rows: 5, cols: 40 });
    frame.applyChunk('Loading 1/3');
    frame.applyChunk('\rDone      ');

    const snap = frame.snapshot();
    expect(snap.visibleText).toContain('Done');
    expect(snap.visibleText).not.toContain('Loading 1/3');
  });

  it('tracks alternate screen mode toggles', () => {
    const frame = new VTFrame({ rows: 5, cols: 40 });
    frame.applyChunk('\x1b[?1049h');
    expect(frame.snapshot().altScreen).toBe(true);
    frame.applyChunk('\x1b[?1049l');
    expect(frame.snapshot().altScreen).toBe(false);
  });

  it('applies cursor positioning for inline overwrite', () => {
    const frame = new VTFrame({ rows: 5, cols: 40 });
    frame.applyChunk('abcde');
    frame.applyChunk('\x1b[1GZ');
    const line = frame.snapshot().lines[0] ?? '';
    expect(line.startsWith('Zbcde')).toBe(true);
  });
});
