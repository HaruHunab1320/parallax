export enum TamagotchiState {
  IDLE = 'idle',
  RECEIVING = 'receiving',
  THINKING = 'thinking',
  WORKING = 'working',
  RESPONDING = 'responding',
  SLEEPING = 'sleeping',
  ERROR = 'error',
}

export interface SpriteFrame {
  data: Uint8Array; // row-major, MSB-first packed bits. width*height/8 bytes
  width: number;    // 32
  height: number;   // 40
}

export interface AnimationFrames {
  frames: SpriteFrame[];
  frameDuration: number; // ticks at 10fps (e.g. 3 = ~300ms per frame)
}

export interface DisplayRenderer {
  render(buffer: Uint8Array): void;
  stop(): void;
}
