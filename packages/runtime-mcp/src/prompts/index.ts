/**
 * MCP Prompts Index
 *
 * Exports all prompt templates for the Parallax MCP server.
 */

export {
  SPAWN_REVIEW_TEAM_PROMPT,
  generateSpawnReviewTeamPrompt,
  type SpawnReviewTeamArgs,
} from './spawn-review-team.js';

export {
  SPAWN_DEV_AGENT_PROMPT,
  generateSpawnDevAgentPrompt,
  type SpawnDevAgentArgs,
} from './spawn-dev-agent.js';

import { SPAWN_REVIEW_TEAM_PROMPT } from './spawn-review-team.js';
import { SPAWN_DEV_AGENT_PROMPT } from './spawn-dev-agent.js';

/**
 * All available prompts
 */
export const ALL_PROMPTS = [
  SPAWN_REVIEW_TEAM_PROMPT,
  SPAWN_DEV_AGENT_PROMPT,
] as const;
