/**
 * Parallax Agent Runtime CLI
 *
 * MCP server for AI agent orchestration.
 *
 * Usage:
 *   npx parallax-agent-runtime [options]
 *
 * Options:
 *   --debug           Enable debug logging
 *   --max-agents=N    Maximum concurrent agents (default: 10)
 *   --help            Show this help message
 *   --version         Show version number
 */

import pino from 'pino';
import { ParallaxMcpServer, StdioServerTransport } from './mcp-server.js';

const VERSION = '0.3.0';

// Parse command line arguments
const args = process.argv.slice(2);

// Handle help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Parallax Agent Runtime - MCP server for AI agent orchestration

Usage:
  npx parallax-agent-runtime [options]

Options:
  --debug           Enable debug logging
  --max-agents=N    Maximum concurrent agents (default: 10)
  --help, -h        Show this help message
  --version, -v     Show version number

Claude Desktop Configuration:
  Add to your claude_desktop_config.json:

  {
    "mcpServers": {
      "parallax": {
        "command": "npx",
        "args": ["parallax-agent-runtime"]
      }
    }
  }

Built on:
  - pty-manager: PTY session management
  - coding-agent-adapters: Claude, Gemini, Codex, Aider adapters

For more information, visit: https://github.com/HaruHunab1320/parallax/tree/main/packages/parallax-agent-runtime
`);
  process.exit(0);
}

// Handle version
if (args.includes('--version') || args.includes('-v')) {
  console.log(VERSION);
  process.exit(0);
}

const logLevel = args.includes('--debug') ? 'debug' : 'info';
const maxAgents = parseInt(
  args.find((a) => a.startsWith('--max-agents='))?.split('=')[1] ?? '10',
  10
);

// Configure logger to stderr (stdout is used for MCP protocol)
const logger = pino({
  level: logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      destination: 2, // stderr
      colorize: true,
    },
  },
});

async function main() {
  logger.info({ version: VERSION, maxAgents }, 'Starting Parallax Agent Runtime');

  // Create server
  const server = new ParallaxMcpServer({
    logger,
    maxAgents,
  });

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Handle shutdown signals
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    await server.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    process.exit(1);
  });

  try {
    // Connect and start serving
    await server.connect(transport);
    logger.info('MCP server ready, waiting for connections...');
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
