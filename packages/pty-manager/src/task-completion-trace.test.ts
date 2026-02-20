import { describe, it, expect } from 'vitest';
import {
  extractTaskCompletionTraceRecords,
  buildTaskCompletionTimeline,
} from './task-completion-trace';

describe('task completion trace utilities', () => {
  it('extracts structured trace records from object/json inputs', () => {
    const records = extractTaskCompletionTraceRecords([
      { msg: 'ignore me', event: 'busy_signal' },
      '{"msg":"Task completion trace","event":"busy_signal","adapterType":"claude","detectTaskComplete":false}',
      {
        msg: 'Task completion trace',
        event: 'debounce_fire',
        adapterType: 'claude',
        detectTaskComplete: true,
        signal: true,
      },
    ]);

    expect(records).toHaveLength(2);
    expect(records[0].event).toBe('busy_signal');
    expect(records[1].event).toBe('debounce_fire');
    expect(records[1].signal).toBe(true);
  });

  it('builds a completed turn timeline from claude trace events', () => {
    const result = buildTaskCompletionTimeline([
      { event: 'busy_signal', adapterType: 'claude', detectTaskComplete: false, detectReady: true },
      { event: 'debounce_schedule', adapterType: 'claude', detectTaskComplete: false, detectReady: true },
      { event: 'debounce_fire', adapterType: 'claude', detectTaskComplete: true, detectReady: true, signal: true },
      { event: 'transition_ready', adapterType: 'claude', detectTaskComplete: true, detectReady: true, signal: true },
    ], { adapterType: 'claude' });

    expect(result.totalRecords).toBe(4);
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].completed).toBe(true);
    expect(result.turns[0].finalConfidence).toBe(100);
    expect(result.turns[0].events.map(e => e.status)).toEqual([
      'active',
      'active',
      'likely_complete',
      'completed',
    ]);
  });

  it('splits turns when a new busy signal occurs after completion', () => {
    const result = buildTaskCompletionTimeline([
      { event: 'busy_signal', adapterType: 'claude', detectTaskComplete: false, detectReady: true },
      { event: 'transition_ready', adapterType: 'claude', detectTaskComplete: true, detectReady: true, signal: true },
      { event: 'busy_signal', adapterType: 'claude', detectTaskComplete: false, detectReady: false },
    ], { adapterType: 'claude' });

    expect(result.turns).toHaveLength(2);
    expect(result.turns[0].completed).toBe(true);
    expect(result.turns[1].completed).toBe(false);
    expect(result.turns[1].events[0].status).toBe('active');
  });

  it('marks reject paths correctly', () => {
    const result = buildTaskCompletionTimeline([
      { event: 'busy_signal', adapterType: 'claude', detectTaskComplete: false, detectReady: true },
      { event: 'debounce_reject_signal', adapterType: 'claude', detectTaskComplete: false, detectReady: true, signal: false },
    ], { adapterType: 'claude' });

    expect(result.turns[0].completed).toBe(false);
    expect(result.turns[0].events[1].status).toBe('rejected');
    expect(result.turns[0].events[1].confidence).toBeLessThan(result.turns[0].events[0].confidence);
  });
});

