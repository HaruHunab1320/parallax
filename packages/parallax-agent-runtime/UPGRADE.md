# Agent Runtime Dependency Upgrade — Development Plan

Bumped internal deps to latest: pty-manager `1.9.6`, coding-agent-adapters `0.12.0`, git-workspace-service `0.4.4`.
This doc tracks the work needed to wire up new features in the runtime.

## Status Key: [ ] todo, [x] done

---

## 1. pty-manager (1.6.6 → 1.9.6)

### High Priority
- [x] **Forward `task_complete` event** — MCP clients need to know when agents finish
- [x] **Forward `tool_running` event** — surface tool activity to prevent false stalls
- [x] **Expose `inheritProcessEnv`** on spawn — security isolation for child agents
- [x] **Add `notifyHookEvent()` method** — bridge external hook events into sessions

### Medium Priority
- [x] **Expose `skipAdapterAutoResponse`** on spawn config
- [x] **Expose `readySettleMs`** on spawn config
- [x] **Expose `stallTimeoutMs`** per-session override (already partially wired)
- [x] **Add `writeRaw()` MCP tool** — raw terminal writes (escape sequences, ctrl chars)
- [x] **Expose `traceTaskCompletion`** debug flag on spawn

## 2. coding-agent-adapters (0.7.2 → 0.12.0)

### High Priority
- [x] **Register `HermesAdapter`** — new agent type can't be spawned without this
- [x] **Add `'hermes'` to `AgentType`** — update all enums and type guards
- [x] **Wire up `getHookTelemetryProtocol()`** — deterministic state detection via hooks
- [x] **Expose HTTP hook mode** — `httpUrl` and `sessionId` options

### Medium Priority
- [x] **Update health check** to include hermes adapter
- [x] **Update all agent type enums in tools** to include hermes
- [x] **Update approval config** to support hermes preset generation

## 3. git-workspace-service (0.4.0 → 0.4.4)

### High Priority
- [x] **Expose `branchName`** in provision_workspace tool (already in schema, verified pass-through)

### Medium Priority
- [x] **Add worktree MCP tools** — `add_worktree`, `list_worktrees`, `remove_worktree`
- [ ] **Surface workspace progress** — `WorkspaceProgress` / `WorkspacePhase` types (deferred — requires event subscription pattern)
- [ ] **Support completion hooks** — webhook/command callbacks on finalization (deferred — requires WorkspaceFinalization type extension upstream)

---

## Files Modified

| File | Changes |
|------|---------|
| `src/types.ts` | Added hermes to AgentType, cli_auth to AuthRequiredInfo, new spawn config fields (inheritProcessEnv, skipAdapterAutoResponse, readySettleMs, traceTaskCompletion), new event types (task_complete, tool_running), ToolRunningInfo and HookEventType types |
| `src/agent-manager.ts` | Registered HermesAdapter, forward task_complete/tool_running events, added notifyHookEvent/writeRaw/getHookTelemetryConfig/addWorktree/listWorktrees/removeWorktree methods, pass new spawn fields through |
| `src/tools/index.ts` | Added hermes to all enums, 6 new MCP tools (notify_hook_event, write_raw, get_hook_config, add_worktree, list_worktrees, remove_worktree), new spawn input fields, executors, TOOL_PERMISSIONS |
| `src/mcp-server.ts` | Added imports and switch cases for all 6 new tools |
| `src/index.ts` | Exported new types, schemas, and executor functions |
| `src/agent-manager.test.ts` | Updated for 5 adapters, new events, hermes mock, worktree mocks |
| `src/tools/index.test.ts` | Updated tool count (21), added interactive field to spawn tests |
| `src/mcp-server.test.ts` | Updated tool count (21), added new method mocks to AgentManager |

## New MCP Tools (6 added, total 21)

| Tool | Permission | Description |
|------|-----------|-------------|
| `notify_hook_event` | `agents:hook` | Forward hook events into agent sessions |
| `write_raw` | `agents:send` | Write raw terminal data |
| `get_hook_config` | `agents:read` | Get hook telemetry protocol config for an agent type |
| `add_worktree` | `workspace:provision` | Add git worktree to existing workspace |
| `list_worktrees` | `workspace:read` | List worktrees for a parent workspace |
| `remove_worktree` | `workspace:cleanup` | Remove a git worktree |

## Remaining Work

Two items deferred — they require upstream changes to `git-workspace-service` types:

1. **Workspace progress tracking** — `WorkspaceProgress`/`WorkspacePhase` are exported but require an event subscription or polling pattern to surface progress during long-running operations (clone, push). Would need a progress callback or SSE stream.

2. **Completion hooks** — `CompletionHook` type exists but `WorkspaceFinalization` doesn't yet accept hooks. Would need the finalization method to accept `onComplete` hooks.
