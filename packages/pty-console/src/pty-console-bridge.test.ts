import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import type {
  SessionHandle,
  SessionMessage,
  StopOptions,
  TerminalAttachment,
  AutoResponseRule,
  WorkerSessionHandle,
} from 'pty-manager';
import { PTYConsoleBridge } from './pty-console-bridge';
import type { PTYManagerLike, PTYManagerAsyncLike } from './types';

class FakeTerminal {
  private listeners = new Set<(data: string) => void>();

  asAttachment(): TerminalAttachment {
    return {
      onData: (callback) => {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
      },
      write: () => {},
      resize: () => {},
    };
  }

  emit(data: string): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
}

class FakeManager extends EventEmitter implements PTYManagerLike {
  readonly handles = new Map<string, SessionHandle>();
  readonly terminals = new Map<string, FakeTerminal>();
  readonly send = vi.fn<(sessionId: string, message: string) => SessionMessage>((sessionId, message) => ({
    id: 'm1',
    sessionId,
    direction: 'inbound',
    type: 'task',
    content: message,
    timestamp: new Date(),
  }));
  readonly stop = vi.fn<(sessionId: string, options?: StopOptions) => Promise<void>>(async () => {});

  list(): SessionHandle[] {
    return [...this.handles.values()];
  }

  get(sessionId: string): SessionHandle | null {
    return this.handles.get(sessionId) ?? null;
  }

  attachTerminal(sessionId: string): TerminalAttachment | null {
    return this.terminals.get(sessionId)?.asAttachment() ?? null;
  }

  getSession(_sessionId: string): {
    sendKeys: (keys: string[] | string) => void;
    resize: (cols: number, rows: number) => void;
    writeRaw: (data: string) => void;
    addAutoResponseRule: () => void;
    clearAutoResponseRules: () => void;
  } | undefined {
    return {
      sendKeys: () => {},
      resize: () => {},
      writeRaw: () => {},
      addAutoResponseRule: () => {},
      clearAutoResponseRules: () => {},
    };
  }
}

class FakeAsyncManager extends EventEmitter implements PTYManagerAsyncLike {
  readonly sessions = new Map<string, WorkerSessionHandle>();
  private readonly dataCallbacks = new Map<string, Set<(data: string) => void>>();

  readonly send = vi.fn<(sessionId: string, data: string) => Promise<void>>(async () => {});
  readonly sendKeys = vi.fn<(sessionId: string, keys: string[] | string) => Promise<void>>(async () => {});
  readonly writeRaw = vi.fn<(sessionId: string, data: string) => Promise<void>>(async () => {});
  readonly resize = vi.fn<(sessionId: string, cols: number, rows: number) => Promise<void>>(async () => {});
  readonly kill = vi.fn<(sessionId: string, signal?: string) => Promise<void>>(async () => {});
  readonly addAutoResponseRule = vi.fn<(sessionId: string, rule: AutoResponseRule) => Promise<void>>(async () => {});
  readonly clearAutoResponseRules = vi.fn<(sessionId: string) => Promise<void>>(async () => {});

  async list(): Promise<WorkerSessionHandle[]> {
    return [...this.sessions.values()];
  }

  get(sessionId: string): WorkerSessionHandle | undefined {
    return this.sessions.get(sessionId);
  }

  onSessionData(sessionId: string, callback: (data: string) => void): () => void {
    if (!this.dataCallbacks.has(sessionId)) {
      this.dataCallbacks.set(sessionId, new Set());
    }
    this.dataCallbacks.get(sessionId)!.add(callback);
    return () => {
      this.dataCallbacks.get(sessionId)?.delete(callback);
    };
  }

  /** Test helper: push data to subscribers for a session */
  pushData(sessionId: string, data: string): void {
    const callbacks = this.dataCallbacks.get(sessionId);
    if (callbacks) {
      for (const cb of callbacks) {
        cb(data);
      }
    }
  }
}

describe('PTYConsoleBridge', () => {
  it('attaches to session output and maintains a capped buffer', () => {
    const manager = new FakeManager();
    const terminal = new FakeTerminal();
    manager.handles.set('s1', {
      id: 's1',
      name: 'agent',
      type: 'claude',
      status: 'busy',
    });
    manager.terminals.set('s1', terminal);

    const bridge = new PTYConsoleBridge(manager, { maxBufferedCharsPerSession: 10 });
    const outputListener = vi.fn();
    bridge.on('session_output', outputListener);

    terminal.emit('hello');
    terminal.emit(' world!');

    expect(outputListener).toHaveBeenCalledTimes(2);
    expect(bridge.getBufferedOutput('s1')).toBe('llo world!');
    bridge.close();
  });

  it('forwards session lifecycle events', () => {
    const manager = new FakeManager();
    const bridge = new PTYConsoleBridge(manager);
    const statusListener = vi.fn();
    bridge.on('session_status', statusListener);

    const handle: SessionHandle = { id: 's2', name: 'agent2', type: 'codex', status: 'ready' };
    manager.emit('session_ready', handle);

    expect(statusListener).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'ready',
      session: handle,
    }));
    bridge.close();
  });

  it('delegates send and stop calls', async () => {
    const manager = new FakeManager();
    const bridge = new PTYConsoleBridge(manager);

    bridge.sendMessage('s3', 'hello');
    await bridge.stopSession('s3');

    expect(manager.send).toHaveBeenCalledWith('s3', 'hello');
    expect(manager.stop).toHaveBeenCalledWith('s3', undefined);
    bridge.close();
  });

  it('forwards auth_required with structured auth info', () => {
    const manager = new FakeManager();
    const bridge = new PTYConsoleBridge(manager);
    const statusListener = vi.fn();
    bridge.on('session_status', statusListener);

    const handle: SessionHandle = {
      id: 's4',
      name: 'agent4',
      type: 'claude',
      status: 'authenticating',
    };
    manager.emit('auth_required', handle, {
      method: 'oauth_browser',
      url: 'https://claude.ai/oauth/authorize',
      instructions: 'Open the URL to sign in',
    });

    expect(statusListener).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'auth_required',
      session: handle,
      auth: expect.objectContaining({
        method: 'oauth_browser',
        url: 'https://claude.ai/oauth/authorize',
      }),
    }));
    bridge.close();
  });
});

describe('PTYConsoleBridge (async manager)', () => {
  it('attaches to async session output via onSessionData', async () => {
    const manager = new FakeAsyncManager();
    const handle: WorkerSessionHandle = {
      id: 'a1',
      name: 'async-agent',
      type: 'claude',
      status: 'busy',
      pid: 1234,
      cols: 120,
      rows: 40,
    };
    manager.sessions.set('a1', handle);

    const bridge = new PTYConsoleBridge(manager, { maxBufferedCharsPerSession: 20 });

    // Wait for async attachToExistingSessions to complete
    await new Promise((r) => setTimeout(r, 10));

    const outputListener = vi.fn();
    bridge.on('session_output', outputListener);

    manager.pushData('a1', 'hello async');

    expect(outputListener).toHaveBeenCalledTimes(1);
    expect(bridge.getBufferedOutput('a1')).toBe('hello async');
    expect(bridge.listSessions()).toEqual([handle]);
    bridge.close();
  });

  it('delegates send/writeRaw/sendKeys to async manager', async () => {
    const manager = new FakeAsyncManager();
    const bridge = new PTYConsoleBridge(manager);

    bridge.sendMessage('a2', 'task message');
    await bridge.writeRaw('a2', 'raw data');
    await bridge.sendKeys('a2', ['Enter']);
    await bridge.resize('a2', 200, 50);
    await bridge.stopSession('a2');
    await bridge.addAutoResponseRule('a2', {
      pattern: /test/,
      type: 'confirmation',
      response: 'y',
      description: 'test rule',
    });
    await bridge.clearAutoResponseRules('a2');

    expect(manager.send).toHaveBeenCalledWith('a2', 'task message');
    expect(manager.writeRaw).toHaveBeenCalledWith('a2', 'raw data');
    expect(manager.sendKeys).toHaveBeenCalledWith('a2', ['Enter']);
    expect(manager.resize).toHaveBeenCalledWith('a2', 200, 50);
    expect(manager.kill).toHaveBeenCalledWith('a2');
    expect(manager.addAutoResponseRule).toHaveBeenCalledWith('a2', expect.objectContaining({
      type: 'confirmation',
      response: 'y',
    }));
    expect(manager.clearAutoResponseRules).toHaveBeenCalledWith('a2');
    bridge.close();
  });

  it('forwards lifecycle events from async manager', () => {
    const manager = new FakeAsyncManager();
    const bridge = new PTYConsoleBridge(manager);
    const statusListener = vi.fn();
    bridge.on('session_status', statusListener);

    const handle: WorkerSessionHandle = {
      id: 'a3',
      name: 'async-agent3',
      type: 'codex',
      status: 'ready',
      pid: 5678,
      cols: 80,
      rows: 24,
    };

    // session_started should add to cache and attach
    manager.emit('session_started', handle);
    expect(statusListener).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'started',
      session: handle,
    }));
    expect(bridge.listSessions()).toHaveLength(1);

    // Push data through onSessionData
    const outputListener = vi.fn();
    bridge.on('session_output', outputListener);
    manager.pushData('a3', 'some output');
    expect(outputListener).toHaveBeenCalledTimes(1);

    // session_stopped should remove from cache
    manager.emit('session_stopped', handle, 'exited');
    expect(statusListener).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'stopped',
      session: handle,
      reason: 'exited',
    }));
    expect(bridge.listSessions()).toHaveLength(0);

    bridge.close();
  });

  it('getSession returns from async manager get()', () => {
    const manager = new FakeAsyncManager();
    const handle: WorkerSessionHandle = {
      id: 'a4',
      name: 'async-agent4',
      type: 'shell',
      status: 'ready',
      pid: 9999,
      cols: 80,
      rows: 24,
    };
    manager.sessions.set('a4', handle);

    const bridge = new PTYConsoleBridge(manager);
    expect(bridge.getSession('a4')).toEqual(handle);
    expect(bridge.getSession('nonexistent')).toBeNull();
    bridge.close();
  });
});
