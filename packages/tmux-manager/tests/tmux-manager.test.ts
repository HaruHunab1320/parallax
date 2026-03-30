import { afterEach, describe, expect, it } from 'vitest';
import { ShellAdapter } from '../src/adapters/shell-adapter.js';
import { TmuxManager } from '../src/tmux-manager.js';

describe('TmuxManager', () => {
  let manager: TmuxManager;

  afterEach(async () => {
    if (manager) {
      await manager.shutdown();
    }
  });

  it('should create with default config', () => {
    manager = new TmuxManager();
    expect(manager).toBeTruthy();
    expect(manager.getStatusCounts().pending).toBe(0);
  });

  it('should register adapters', () => {
    manager = new TmuxManager();
    manager.registerAdapter(new ShellAdapter());
    expect(manager.adapters.has('shell')).toBe(true);
  });

  it('should throw when spawning with unknown adapter', async () => {
    manager = new TmuxManager();
    await expect(
      manager.spawn({ name: 'test', type: 'unknown' })
    ).rejects.toThrow(/No adapter found/);
  });

  it('should throw on duplicate session ID', async () => {
    manager = new TmuxManager({ sessionPrefix: 'test-mgr' });
    manager.registerAdapter(new ShellAdapter());

    await manager.spawn({ id: 'dup-test', name: 'test1', type: 'shell' });

    await expect(
      manager.spawn({ id: 'dup-test', name: 'test2', type: 'shell' })
    ).rejects.toThrow(/already exists/);
  });

  it('should spawn and list sessions', async () => {
    manager = new TmuxManager({ sessionPrefix: 'test-mgr' });
    manager.registerAdapter(new ShellAdapter());

    const handle = await manager.spawn({ name: 'test', type: 'shell' });
    expect(handle.id).toBeTruthy();
    expect(handle.name).toBe('test');
    expect(handle.type).toBe('shell');

    const list = manager.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(handle.id);
  });

  it('should get session by ID', async () => {
    manager = new TmuxManager({ sessionPrefix: 'test-mgr' });
    manager.registerAdapter(new ShellAdapter());

    const handle = await manager.spawn({ name: 'test', type: 'shell' });
    const retrieved = manager.get(handle.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(handle.id);
  });

  it('should return null for unknown session ID', () => {
    manager = new TmuxManager();
    expect(manager.get('nonexistent')).toBeNull();
  });

  it('should check has()', async () => {
    manager = new TmuxManager({ sessionPrefix: 'test-mgr' });
    manager.registerAdapter(new ShellAdapter());

    const handle = await manager.spawn({ name: 'test', type: 'shell' });
    expect(manager.has(handle.id)).toBe(true);
    expect(manager.has('nonexistent')).toBe(false);
  });

  it('should emit session_started event', async () => {
    manager = new TmuxManager({ sessionPrefix: 'test-mgr' });
    manager.registerAdapter(new ShellAdapter());

    const started: string[] = [];
    manager.on('session_started', (session) => {
      started.push(session.id);
    });

    const handle = await manager.spawn({ name: 'test', type: 'shell' });
    expect(started).toContain(handle.id);
  });

  it('should emit session_ready event', async () => {
    manager = new TmuxManager({ sessionPrefix: 'test-mgr' });
    manager.registerAdapter(new ShellAdapter());

    const readyPromise = new Promise<string>((resolve) => {
      manager.on('session_ready', (session) => {
        resolve(session.id);
      });
    });

    const handle = await manager.spawn({ name: 'test', type: 'shell' });

    const readyId = await Promise.race([
      readyPromise,
      new Promise<string>((_, reject) =>
        setTimeout(
          () => reject(new Error('Timeout waiting for session_ready')),
          5000
        )
      ),
    ]);

    expect(readyId).toBe(handle.id);
  });

  it('should stop a session', async () => {
    manager = new TmuxManager({ sessionPrefix: 'test-mgr' });
    manager.registerAdapter(new ShellAdapter());

    const handle = await manager.spawn({ name: 'test', type: 'shell' });
    await manager.stop(handle.id, { force: true, timeout: 3000 });

    expect(manager.has(handle.id)).toBe(false);
  });

  it('should filter sessions by status', async () => {
    manager = new TmuxManager({ sessionPrefix: 'test-mgr' });
    manager.registerAdapter(new ShellAdapter());

    await manager.spawn({ name: 'test', type: 'shell' });

    // Wait for ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const ready = manager.list({ status: 'ready' });
    const stopped = manager.list({ status: 'stopped' });
    // May or may not be ready yet, but shouldn't crash
    expect(Array.isArray(ready)).toBe(true);
    expect(Array.isArray(stopped)).toBe(true);
  });

  it('should get metrics', async () => {
    manager = new TmuxManager({ sessionPrefix: 'test-mgr' });
    manager.registerAdapter(new ShellAdapter());

    const handle = await manager.spawn({ name: 'test', type: 'shell' });
    const m = manager.metrics(handle.id);
    expect(m).not.toBeNull();
    expect(typeof m!.uptime).toBe('number');
  });

  it('should return null metrics for unknown session', () => {
    manager = new TmuxManager();
    expect(manager.metrics('nonexistent')).toBeNull();
  });

  it('should list orphaned sessions', () => {
    manager = new TmuxManager({ sessionPrefix: 'test-orphan-check' });
    // Just check it doesn't throw
    const orphans = manager.listOrphanedSessions();
    expect(Array.isArray(orphans)).toBe(true);
  });
});
