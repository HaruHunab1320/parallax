/**
 * DecisionJournal unit tests
 *
 * The journal subscribes to a workflow executor's confidence/outcome events
 * and persists them through the shared-decision and episodic-experience
 * repositories. These tests drive it with a bare EventEmitter.
 */

import { EventEmitter } from 'node:events';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DecisionJournal } from '../decision-journal';

const logger = pino({ level: 'silent' });

const META = { executionId: 'exec-1', patternName: 'startup-team' };

function makeStores() {
  return {
    sharedDecisions: { create: vi.fn().mockResolvedValue({}) },
    episodicExperiences: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe('DecisionJournal', () => {
  let executor: EventEmitter;
  let stores: ReturnType<typeof makeStores>;
  let journal: DecisionJournal;

  beforeEach(() => {
    executor = new EventEmitter();
    stores = makeStores();
    journal = new DecisionJournal(stores, logger);
  });

  it('persists each step_confidence event as a shared decision', async () => {
    journal.attach(executor, META);

    executor.emit('step_confidence', {
      executionId: 'internal-id',
      step: 0,
      role: 'engineer',
      action: 'retry',
      confidence: 0.45,
      source: 'verify',
      detail: 'tests failed',
    });
    await journal.flush();

    expect(stores.sharedDecisions.create).toHaveBeenCalledTimes(1);
    const row = stores.sharedDecisions.create.mock.calls[0][0];
    expect(row.executionId).toBe('exec-1'); // durable id, not the internal one
    expect(row.category).toBe('confidence_policy');
    expect(row.summary).toBe('engineer: retry at 0.45 (verify)');
    expect(row.details).toMatchObject({
      role: 'engineer',
      action: 'retry',
      detail: 'tests failed',
      patternName: 'startup-team',
    });
  });

  it('summarises no-signal decisions without a confidence value', async () => {
    journal.attach(executor, META);

    executor.emit('step_confidence', {
      role: 'engineer',
      action: 'no_signal',
      source: 'selfreport',
    });
    await journal.flush();

    const row = stores.sharedDecisions.create.mock.calls[0][0];
    expect(row.summary).toBe('engineer: no_signal (selfreport)');
  });

  it('labels the execution with a success outcome and decision tally', async () => {
    journal.attach(executor, {
      ...META,
      objective: 'build the parser',
      repo: 'org/repo',
    });

    executor.emit('step_confidence', {
      role: 'engineer',
      action: 'accept',
      confidence: 0.9,
      source: 'verify',
    });
    executor.emit('step_confidence', {
      role: 'reviewer',
      action: 'escalate',
      confidence: 0.2,
      source: 'verify',
    });
    executor.emit('workflow_completed', {
      executionId: 'internal-id',
      durationMs: 1234,
    });
    await journal.flush();

    expect(stores.episodicExperiences.create).toHaveBeenCalledTimes(1);
    const row = stores.episodicExperiences.create.mock.calls[0][0];
    expect(row.executionId).toBe('exec-1');
    expect(row.objective).toBe('build the parser');
    expect(row.repo).toBe('org/repo');
    expect(row.outcome).toBe('success');
    expect(row.summary).toContain('success after 2 confidence decision(s)');
    expect(row.summary).toContain('1 accept');
    expect(row.summary).toContain('1 escalate');
    expect(row.details).toMatchObject({
      decisions: { accept: 1, escalate: 1 },
      durationMs: 1234,
      workflowExecutionId: 'internal-id',
    });
  });

  it('labels a failed workflow with the error and records only one outcome', async () => {
    journal.attach(executor, META);

    executor.emit('workflow_failed', { error: 'boom', durationMs: 10 });
    executor.emit('workflow_completed', { durationMs: 10 });
    await journal.flush();

    expect(stores.episodicExperiences.create).toHaveBeenCalledTimes(1);
    const row = stores.episodicExperiences.create.mock.calls[0][0];
    expect(row.outcome).toBe('failure');
    expect(row.objective).toBe('startup-team'); // falls back to pattern name
    expect(row.details.error).toBe('boom');
  });

  it('swallows persistence failures so the workflow is never affected', async () => {
    stores.sharedDecisions.create.mockRejectedValue(new Error('db down'));
    journal.attach(executor, META);

    executor.emit('step_confidence', { role: 'engineer', action: 'accept' });

    await expect(journal.flush()).resolves.toBeUndefined();
  });

  it('stops recording after detach', async () => {
    const detach = journal.attach(executor, META);
    detach();

    executor.emit('step_confidence', { role: 'engineer', action: 'accept' });
    executor.emit('workflow_completed', {});
    await journal.flush();

    expect(stores.sharedDecisions.create).not.toHaveBeenCalled();
    expect(stores.episodicExperiences.create).not.toHaveBeenCalled();
  });
});
