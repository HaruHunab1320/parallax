import { createRenderer } from './composite-renderer';
import { FrameBuffer } from './frame-buffer';
import { PERSONA_SPRITES } from './sprites';
import {
  type AnimationFrames,
  type DisplayRenderer,
  type PersonaId,
  TamagotchiState,
} from './types';

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
  private readonly personaId: PersonaId;
  private readonly sprites: Record<TamagotchiState, AnimationFrames>;

  // Scrolling message state
  private scrollLines: string[] = [];
  private scrollOffset = 0;
  private scrollTickCounter = 0;
  private scrollActive = false;
  private readonly SCROLL_TICK_INTERVAL = 20; // ~2 seconds at 10fps
  private readonly SCROLL_PAUSE_TICKS = 40; // ~4 seconds pause at end before reset

  constructor(personaId: string, renderer?: DisplayRenderer) {
    this.personaId = personaId as PersonaId;
    this.sprites = PERSONA_SPRITES[this.personaId] || PERSONA_SPRITES.echo;
    this.renderer = renderer || createRenderer(this.personaId);
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

  /**
   * Set a scrolling message that word-wraps into 14-char lines and
   * auto-scrolls through the content every ~2 seconds.
   * Replaces normal textLines while active.
   */
  setScrollingMessage(message: string): void {
    this.scrollLines = this.wordWrap(message);
    this.scrollOffset = 0;
    this.scrollTickCounter = 0;
    this.scrollActive = true;
  }

  /** Word-wrap text into lines of TEXT_MAX_CHARS width. */
  private wordWrap(text: string): string[] {
    const lines: string[] = [];
    const words = text.split(/\s+/);
    let current = '';
    for (const word of words) {
      if (word.length === 0) continue;
      // If a single word exceeds max width, split it
      if (word.length > TEXT_MAX_CHARS) {
        if (current.length > 0) {
          lines.push(current);
          current = '';
        }
        for (let i = 0; i < word.length; i += TEXT_MAX_CHARS) {
          lines.push(word.slice(i, i + TEXT_MAX_CHARS));
        }
        continue;
      }
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (candidate.length <= TEXT_MAX_CHARS) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current.length > 0) {
      lines.push(current);
    }
    return lines;
  }

  /** Add a line to the scrolling text log. */
  addTextLine(line: string): void {
    const trimmed =
      line.length > TEXT_MAX_CHARS ? line.slice(0, TEXT_MAX_CHARS) : line;
    this.textLines.push(trimmed);
    if (this.textLines.length > MAX_TEXT_LINES) {
      this.textLines.shift();
    }
  }

  /** Update the last line that starts with `prefix`, or add a new line if none match. */
  updateLastMatchingLine(prefix: string, newLine: string): void {
    const trimmed =
      newLine.length > TEXT_MAX_CHARS
        ? newLine.slice(0, TEXT_MAX_CHARS)
        : newLine;
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
        // Stay in RESPONDING while scrolling message is active;
        // otherwise fall back to IDLE after 2s
        if (!this.scrollActive && elapsed >= 2000)
          this.setState(TamagotchiState.IDLE);
        break;
      case TamagotchiState.ERROR:
        if (elapsed >= 3000) this.setState(TamagotchiState.IDLE);
        break;
    }

    // Advance animation frame
    const anim = this.sprites[this.state];
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

    // 4. Text lines (scrolling message takes priority when active)
    if (this.scrollActive && this.scrollLines.length > 0) {
      this.scrollTickCounter++;

      const maxOffset = Math.max(0, this.scrollLines.length - MAX_TEXT_LINES);

      if (this.scrollOffset < 0) {
        // Negative offset = pause phase at the end before resetting
        this.scrollOffset++;
        if (this.scrollOffset >= 0) {
          this.scrollActive = false;
          this.setState(TamagotchiState.IDLE);
        }
      } else if (this.scrollTickCounter >= this.SCROLL_TICK_INTERVAL) {
        this.scrollTickCounter = 0;
        if (this.scrollOffset < maxOffset) {
          this.scrollOffset++;
        } else {
          // Reached the end — enter pause phase via negative offset
          this.scrollOffset = -this.SCROLL_PAUSE_TICKS;
        }
      }

      const effectiveOffset = Math.max(0, this.scrollOffset);
      const visibleLines = this.scrollLines.slice(
        effectiveOffset,
        effectiveOffset + MAX_TEXT_LINES
      );
      for (let i = 0; i < visibleLines.length; i++) {
        this.frameBuf.drawString(
          visibleLines[i],
          TEXT_START_X,
          TEXT_START_Y + i * TEXT_LINE_HEIGHT
        );
      }
    } else {
      for (let i = 0; i < this.textLines.length; i++) {
        this.frameBuf.drawString(
          this.textLines[i],
          TEXT_START_X,
          TEXT_START_Y + i * TEXT_LINE_HEIGHT
        );
      }
    }

    // 5. Push to renderers
    this.renderer.render(this.frameBuf.buffer);
  }
}
