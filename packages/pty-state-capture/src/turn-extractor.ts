import { normalizeForMatching } from './normalize';
import type {
  FeedOutputResult,
  IdleStateKind,
  StateKind,
  StateTransition,
  StreamDirection,
  Turn,
  TurnTiming,
} from './types';

const DEFAULT_IDLE_STATES: IdleStateKind[] = [
  'ready_for_input',
  'awaiting_input',
  'awaiting_approval',
  'awaiting_auth',
  'completed',
];

const DEFAULT_MAX_RAW_OUTPUT = 100_000;
const DEFAULT_MAX_CLEAN_OUTPUT = 50_000;

export interface TurnExtractorOptions {
  idleStates?: IdleStateKind[];
  maxRawOutputPerTurn?: number;
  maxCleanOutputPerTurn?: number;
}

interface InProgressTurn {
  index: number;
  startedAt: string;
  input: string;
  rawOutput: string;
  cleanOutput: string;
  transitions: StateTransition[];
  finalState: StateKind;
  eventCount: number;
}

export class TurnExtractor {
  private readonly idleStates: Set<IdleStateKind>;
  private readonly maxRaw: number;
  private readonly maxClean: number;
  private readonly completedTurns: Turn[] = [];
  private current: InProgressTurn | null = null;
  private pendingInput = '';
  private nextIndex = 0;
  private lastState: StateKind = 'unknown';
  private bootstrapped = false;

  constructor(options: TurnExtractorOptions = {}) {
    this.idleStates = new Set(options.idleStates ?? DEFAULT_IDLE_STATES);
    this.maxRaw = options.maxRawOutputPerTurn ?? DEFAULT_MAX_RAW_OUTPUT;
    this.maxClean = options.maxCleanOutputPerTurn ?? DEFAULT_MAX_CLEAN_OUTPUT;
  }

  push(result: FeedOutputResult, chunk: string, direction: StreamDirection): Turn | undefined {
    const currentStateKind = result.state.state;
    const wasIdle = this.isIdle(this.lastState);
    const nowIdle = this.isIdle(currentStateKind);
    const ts = result.state.ts;

    // Accumulate stdin
    if (direction === 'stdin') {
      if (this.current) {
        this.current.input += chunk;
        this.current.eventCount += 1;
      } else {
        this.pendingInput += chunk;
      }
      this.lastState = currentStateKind;
      return undefined;
    }

    // Handle bootstrap: session start → first idle state
    if (!this.bootstrapped) {
      if (nowIdle) {
        this.bootstrapped = true;
        // Create bootstrap turn (turn 0) with empty input
        if (!this.current) {
          this.current = {
            index: this.nextIndex++,
            startedAt: ts,
            input: '',
            rawOutput: '',
            cleanOutput: '',
            transitions: [],
            finalState: 'unknown',
            eventCount: 0,
          };
        }
        this.appendOutput(this.current, chunk);
        this.current.eventCount += 1;
        this.current.finalState = currentStateKind;
        if (result.transition) {
          this.current.transitions.push(result.transition);
        }
        const completed = this.finalizeTurn(this.current, ts);
        this.completedTurns.push(completed);
        this.current = null;
        this.lastState = currentStateKind;
        return completed;
      }

      // Still bootstrapping, accumulate into turn 0
      if (!this.current) {
        this.current = {
          index: this.nextIndex++,
          startedAt: ts,
          input: '',
          rawOutput: '',
          cleanOutput: '',
          transitions: [],
          finalState: 'unknown',
          eventCount: 0,
        };
      }
      this.appendOutput(this.current, chunk);
      this.current.eventCount += 1;
      if (result.transition) {
        this.current.transitions.push(result.transition);
      }
      this.current.finalState = currentStateKind;
      this.lastState = currentStateKind;
      return undefined;
    }

    // Post-bootstrap: idle → non-idle starts a new turn
    if (wasIdle && !nowIdle) {
      this.current = {
        index: this.nextIndex++,
        startedAt: ts,
        input: this.pendingInput,
        rawOutput: '',
        cleanOutput: '',
        transitions: [],
        finalState: 'unknown',
        eventCount: 0,
      };
      this.pendingInput = '';
    }

    // Idle → idle: no spurious turn, just accumulate stdin
    if (wasIdle && nowIdle) {
      this.lastState = currentStateKind;
      return undefined;
    }

    // Active turn: accumulate output
    if (this.current) {
      this.appendOutput(this.current, chunk);
      this.current.eventCount += 1;
      this.current.finalState = currentStateKind;
      if (result.transition) {
        this.current.transitions.push(result.transition);
      }

      // Non-idle → idle: turn ends
      if (nowIdle) {
        const completed = this.finalizeTurn(this.current, ts);
        this.completedTurns.push(completed);
        this.current = null;
        this.lastState = currentStateKind;
        return completed;
      }
    }

    this.lastState = currentStateKind;
    return undefined;
  }

  getCompletedTurns(): Turn[] {
    return [...this.completedTurns];
  }

  getCurrentTurn(): Partial<Turn> | null {
    if (!this.current) return null;
    return {
      index: this.current.index,
      input: this.current.input,
      rawOutput: this.current.rawOutput,
      cleanOutput: this.current.cleanOutput,
      transitions: [...this.current.transitions],
      finalState: this.current.finalState,
      eventCount: this.current.eventCount,
    };
  }

  private isIdle(state: StateKind): boolean {
    return this.idleStates.has(state as IdleStateKind);
  }

  private appendOutput(turn: InProgressTurn, chunk: string): void {
    // Raw output — truncate from front (keep tail)
    turn.rawOutput += chunk;
    if (turn.rawOutput.length > this.maxRaw) {
      turn.rawOutput = turn.rawOutput.slice(-this.maxRaw);
    }

    // Clean output
    const clean = normalizeForMatching(chunk);
    if (clean) {
      turn.cleanOutput += (turn.cleanOutput ? ' ' : '') + clean;
      if (turn.cleanOutput.length > this.maxClean) {
        turn.cleanOutput = turn.cleanOutput.slice(-this.maxClean);
      }
    }
  }

  private finalizeTurn(inProgress: InProgressTurn, endTs: string): Turn {
    const startedAt = inProgress.startedAt;
    const endedAt = endTs;
    const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    const timing: TurnTiming = { startedAt, endedAt, durationMs };

    return {
      index: inProgress.index,
      timing,
      input: inProgress.input,
      rawOutput: inProgress.rawOutput,
      cleanOutput: inProgress.cleanOutput,
      transitions: inProgress.transitions,
      finalState: inProgress.finalState,
      eventCount: inProgress.eventCount,
    };
  }
}
