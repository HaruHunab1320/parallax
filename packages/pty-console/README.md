# pty-console

UI bridge package for rendering and controlling multiple `pty-manager` sessions in operator consoles (grid views, session panes, manual intervention tooling).

## What it provides

- Live per-session output stream events (`session_output`)
- Session lifecycle/status stream (`session_status`)
- Per-session buffered output snapshots for initial pane hydration
- Control helpers for manual intervention:
  - send a formatted agent message
  - write raw terminal data
  - send key sequences
  - resize session terminal
  - stop a session
  - add/clear auto-response rules

## Install

```bash
pnpm add pty-console
```

## Usage

```ts
import { PTYManager } from 'pty-manager';
import { PTYConsoleBridge } from 'pty-console';

const manager = new PTYManager();
const bridge = new PTYConsoleBridge(manager, {
  maxBufferedCharsPerSession: 100_000,
});

// hydrate UI grid
const initialCards = bridge.getSnapshot();

// live terminal data for panes
bridge.on('session_output', ({ sessionId, data }) => {
  // append to xterm.js instance for sessionId
  // terminalMap.get(sessionId)?.write(data);
});

// status chips / alerts / operator actions
bridge.on('session_status', (event) => {
  // event.kind: started|ready|status_changed|task_complete|blocking_prompt|...
});

// manual operator intervention
bridge.sendMessage('session-1', 'continue with the refactor');
bridge.sendKeys('session-1', ['ctrl+c']);
bridge.writeRaw('session-1', 'y\r');
```

## Notes

- `pty-console` is intentionally UI-framework-agnostic.
- Pair with `xterm.js` (or similar) in web/desktop apps for live embedded terminals.
- Keep this package as the UI/control bridge; leave PTY lifecycle logic in `pty-manager`.

