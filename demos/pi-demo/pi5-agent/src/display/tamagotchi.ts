import { TamagotchiState, DisplayRenderer } from './types';
import { FrameBuffer } from './frame-buffer';
import { SPRITES } from './sprites';
import { createRenderer } from './composite-renderer';

const MAX_TEXT_LINES = 5;
const TEXT_MAX_CHARS = 14;
const SPRITE_X = 4;
const SPRITE_Y = 4;
const SEPARATOR_X = 41;
const TEXT_START_X = 43;
const TEXT_START_Y = 2;
const TEXT_LINE_HEIGHT = 12;
const STATE_LABEL_X = 2;
const STATE_LABEL_Y = 52;
const SLEEP_TIMEOUT_MS = 60_000;

export class TamagotchiDisplay {
  private frameBuf = new FrameBuffer();
  private state = TamagotchiState.IDLE;
  private frameCounter = 0;
  private tickCounter = 0;
  private textLines: string[] = [];
  private renderer: DisplayRenderer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastStateChange = Date.now();
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(renderer?: DisplayRenderer) {
    this.renderer = renderer || createRenderer();
    this.resetSleepTimer();
  }

  /** Change state and reset timers. */
  setState(state: TamagotchiState): void {
    this.state = state;
    this.frameCounter = 0;
    this.tickCounter = 0;
    this.lastStateChange = Date.now();
    this.resetSleepTimer();
  }

  getState(): TamagotchiState {
    return this.state;
  }

  /** Add a line to the scrolling text log. */
  addTextLine(line: string): void {
    const trimmed = line.length > TEXT_MAX_CHARS ? line.slice(0, TEXT_MAX_CHARS) : line;
    this.textLines.push(trimmed);
    if (this.textLines.length > MAX_TEXT_LINES) {
      this.textLines.shift();
    }
  }

  /** Update the last line that starts with `prefix`, or add a new line if none match. */
  updateLastMatchingLine(prefix: string, newLine: string): void {
    const trimmed = newLine.length > TEXT_MAX_CHARS ? newLine.slice(0, TEXT_MAX_CHARS) : newLine;
    for (let i = this.textLines.length - 1; i >= 0; i--) {
      if (this.textLines[i].startsWith(prefix.slice(0, TEXT_MAX_CHARS))) {
        this.textLines[i] = trimmed;
        return;
      }
    }
    this.addTextLine(newLine);
  }

  /** Start the 10fps render loop. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 100);
  }

  /** Stop the render loop and clean up. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    this.renderer.stop();
  }

  private resetSleepTimer(): void {
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
    }
    this.sleepTimer = setTimeout(() => {
      if (this.state === TamagotchiState.IDLE) {
        this.setState(TamagotchiState.SLEEPING);
      }
    }, SLEEP_TIMEOUT_MS);
  }

  private tick(): void {
    this.tickCounter++;

    // Auto-transitions based on elapsed time
    const elapsed = Date.now() - this.lastStateChange;
    switch (this.state) {
      case TamagotchiState.RECEIVING:
        if (elapsed >= 500) this.setState(TamagotchiState.THINKING);
        break;
      case TamagotchiState.RESPONDING:
        if (elapsed >= 2000) this.setState(TamagotchiState.IDLE);
        break;
      case TamagotchiState.ERROR:
        if (elapsed >= 3000) this.setState(TamagotchiState.IDLE);
        break;
    }

    // Advance animation frame
    const anim = SPRITES[this.state];
    if (this.tickCounter % anim.frameDuration === 0) {
      this.frameCounter = (this.frameCounter + 1) % anim.frames.length;
    }

    // Compose frame
    this.frameBuf.clear();

    // 1. Blit sprite
    const sprite = anim.frames[this.frameCounter];
    this.frameBuf.blitSprite(sprite, SPRITE_X, SPRITE_Y);

    // 2. Dotted separator
    this.frameBuf.drawDottedVLine(SEPARATOR_X);

    // 3. State label
    this.frameBuf.drawString(this.state, STATE_LABEL_X, STATE_LABEL_Y);

    // 4. Text lines
    for (let i = 0; i < this.textLines.length; i++) {
      this.frameBuf.drawString(
        this.textLines[i],
        TEXT_START_X,
        TEXT_START_Y + i * TEXT_LINE_HEIGHT
      );
    }

    // 5. Push to renderers
    this.renderer.render(this.frameBuf.buffer);
  }
}
