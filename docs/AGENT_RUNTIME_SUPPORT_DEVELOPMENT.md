# Agent Runtime Support - Development Plan

This document defines the agent runtime layer needed to run interactive CLI agents (Claude Code, Codex, Gemini CLI, Aider) and register them with Parallax. The plan starts with a local runtime MVP and progresses to Parallax-managed Kubernetes hosting.

## Goals
- Provide a runtime that launches PTY-backed CLI agent sessions.
- Register running agents into the Parallax registry.
- Support interactive auth flows without breaking automation.
- Enable Parallax-managed hosting as an enterprise feature.

## Non-Goals
- Replace the Parallax control plane or coordination patterns.
- Build an orchestration UI inside Parallax.

## Runtime Responsibilities
- Spawn and supervise agent sessions (PTY or tmux).
- Maintain session state and logs.
- Emit status + health info for registry.
- Handle "login required" events and resume after auth.

## Architecture Overview
Parallax Control Plane (registry + scheduling)
  -> Agent Runtime (local or K8s)
    -> CLI sessions (claude, codex, gemini, aider)
      -> MCP calls to Raven Docs

## Local Runtime MVP
- Single host daemon runs on a developer machine or VM.
- Accepts spawn requests over HTTP/gRPC.
- Starts CLI in PTY with isolated working dir + env.
- Registers agents in Parallax registry (etcd).
- Exposes logs and status via runtime API.

## Parallax-Managed K8s (Phase 2)
- Runtime becomes a service that can create per-agent pods.
- Each pod includes:
  - CLI agent binary
  - PTY session + supervisor
  - Workspace volume (optional)
  - MCP API key injected as secret
- Runtime registers each agent to registry with TTL.
- Supports quotas, policies, and billing signals.

## Registry Contract (Existing)
- Agents register as `type=agent` in etcd.
- Metadata includes capabilities + endpoint + health.
- Control plane already lists and health-checks agents.

## Proposed Runtime API (Minimal)
- POST /spawn
  - agentId, agentType, workspaceId, capabilities, env, workdir
- POST /stop
  - agentId
- GET /agents
  - list running agents + status
- GET /agents/:id/logs
  - tail logs / last N lines

## Auth + Login Handling
- If CLI emits login prompt:
  - Runtime marks agent as "login_required".
  - Emits event to caller (Parallax or Raven).
  - After login, runtime resumes and registers agent.

## Security Notes
- Keep MCP API keys per agent and rotate.
- Least-privileged filesystem + network access.
- Hard limits on runtime CPU/mem per agent.

## Milestones
1) Runtime MVP (local)
   - Spawn + stop
   - PTY sessions
   - Registry registration

2) Parallax Cloud Runtime (K8s)
   - Pod-per-agent
   - Registry TTL + health
   - Quotas and billing hooks

3) Enterprise Runtime (optional)
   - Bring-your-own-cluster
   - mTLS + audit log streaming

## Open Questions
- Should runtime live as a Parallax package or separate repo?
- How to expose interactive login (web terminal, device code)?
- How to persist session state across restarts?
