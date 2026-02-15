/**
 * MCP Auth Module
 *
 * Provides authentication for the Parallax MCP server.
 */

export { McpAuthHandler } from './auth-handler.js';
export {
  type McpAuthConfig,
  type ApiKeyConfig,
  type AuthContext,
  type AuthErrorCode,
  McpAuthError,
} from './types.js';
