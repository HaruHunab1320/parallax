/**
 * MCP Resources Index
 *
 * Exports all resource handlers for the Parallax MCP server.
 */

export {
  AGENT_RESOURCE_TEMPLATE,
  parseAgentUri,
  listAgentResources,
  readAgentResource,
} from './agent-resource.js';

export {
  LOGS_RESOURCE_TEMPLATE,
  parseLogsUri,
  listLogsResources,
  readLogsResource,
  subscribeLogsResource,
} from './logs-resource.js';

import { AGENT_RESOURCE_TEMPLATE } from './agent-resource.js';
import { LOGS_RESOURCE_TEMPLATE } from './logs-resource.js';

/**
 * All resource templates
 */
export const ALL_RESOURCE_TEMPLATES = [
  AGENT_RESOURCE_TEMPLATE,
  LOGS_RESOURCE_TEMPLATE,
] as const;
