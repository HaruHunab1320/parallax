/**
 * Coding Swarm Agent Configuration
 */

export type AdapterType = 'claude' | 'codex' | 'gemini' | 'aider' | 'hermes';

export interface SwarmAgentConfig {
  /** Unique agent ID (e.g., "vero", "sable") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Default coding agent type for this Pi */
  agentType: AdapterType;
  /** Device type (mac, pi) — used for pattern role matching */
  device: string;
  /** Gateway endpoint (host:port) */
  gatewayEndpoint: string;
  /** Tmux session prefix */
  tmuxPrefix?: string;
  /** Terminal dimensions for the 5" LCD (800x480 = ~100x30) */
  terminalCols?: number;
  terminalRows?: number;
}

export function loadConfig(): SwarmAgentConfig {
  const id = process.env.AGENT_ID || 'swarm-dev';
  const name = process.env.AGENT_NAME || id;
  const agentType = (process.env.AGENT_TYPE || 'claude') as AdapterType;
  const gatewayEndpoint = process.env.PARALLAX_GATEWAY || 'localhost:50051';

  return {
    id,
    name,
    agentType,
    device: process.env.AGENT_DEVICE || 'unknown',
    gatewayEndpoint,
    tmuxPrefix: process.env.TMUX_PREFIX || 'swarm',
    terminalCols: parseInt(process.env.TERMINAL_COLS || '100', 10),
    terminalRows: parseInt(process.env.TERMINAL_ROWS || '28', 10),
  };
}
