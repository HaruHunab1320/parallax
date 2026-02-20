import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import type {
  SessionHandle,
  SessionMessage,
  StopOptions,
  TerminalAttachment,
} from 'pty-manager';
import { PTYConsoleBridge } from './pty-console-bridge';
import type { PTYManagerLike } from './types';

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
});
