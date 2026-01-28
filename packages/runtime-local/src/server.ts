/**
 * Local Runtime HTTP Server
 *
 * REST API for managing local CLI agent sessions.
 */

import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server, IncomingMessage } from 'http';
import { Logger } from 'pino';
import { LocalRuntime } from './local-runtime';
import { AgentConfig, AgentHandle, AgentMessage } from '@parallax/runtime-interface';

export interface RuntimeServerOptions {
  port: number;
  host?: string;
}

export class RuntimeServer {
  private app: express.Application;
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private terminalWss: WebSocketServer | null = null;
  private eventsWss: WebSocketServer | null = null;
  private agentSubscribers: Map<string, Set<WebSocket>> = new Map();
  private terminalConnections: Map<string, Set<WebSocket>> = new Map();

  constructor(
    private runtime: LocalRuntime,
    private logger: Logger,
    private options: RuntimeServerOptions
  ) {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupRuntimeEvents();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // Request logging
    this.app.use((req, _res, next) => {
      this.logger.debug({ method: req.method, path: req.path }, 'Request');
      next();
    });
  }

  private setupRoutes(): void {
    const router = express.Router();

    // Health check
    router.get('/health', async (_req: Request, res: Response) => {
      const health = await this.runtime.healthCheck();
      res.json(health);
    });

    // List agents
    router.get('/agents', async (req: Request, res: Response) => {
      try {
        const filter: any = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.role) filter.role = req.query.role;
        if (req.query.type) filter.type = req.query.type;

        const agents = await this.runtime.list(filter);
        res.json({ agents, count: agents.length });
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // Get agent by ID
    router.get('/agents/:id', async (req: Request, res: Response) => {
      try {
        const agent = await this.runtime.get(req.params.id);
        if (!agent) {
          res.status(404).json({ error: 'Agent not found' });
          return;
        }
        res.json(agent);
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // Spawn agent
    router.post('/agents', async (req: Request, res: Response) => {
      try {
        const config: AgentConfig = req.body;

        if (!config.type) {
          res.status(400).json({ error: 'Agent type is required' });
          return;
        }

        if (!config.name) {
          res.status(400).json({ error: 'Agent name is required' });
          return;
        }

        if (!config.capabilities) {
          config.capabilities = [];
        }

        const agent = await this.runtime.spawn(config);
        res.status(201).json(agent);
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // Stop agent
    router.delete('/agents/:id', async (req: Request, res: Response) => {
      try {
        const force = req.query.force === 'true';
        const timeout = req.query.timeout
          ? parseInt(req.query.timeout as string, 10)
          : undefined;

        await this.runtime.stop(req.params.id, { force, timeout });
        res.status(204).send();
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // Send message to agent
    router.post('/agents/:id/send', async (req: Request, res: Response) => {
      try {
        const { message, expectResponse, timeout } = req.body;

        if (!message) {
          res.status(400).json({ error: 'Message is required' });
          return;
        }

        const response = await this.runtime.send(req.params.id, message, {
          expectResponse,
          timeout,
        });

        res.json({ sent: true, response });
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // Get agent logs
    router.get('/agents/:id/logs', async (req: Request, res: Response) => {
      try {
        const tail = req.query.tail
          ? parseInt(req.query.tail as string, 10)
          : 100;

        const logs: string[] = [];
        for await (const line of this.runtime.logs(req.params.id, { tail })) {
          logs.push(line);
        }

        res.json({ logs, count: logs.length });
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // Get agent metrics
    router.get('/agents/:id/metrics', async (req: Request, res: Response) => {
      try {
        const metrics = await this.runtime.metrics(req.params.id);
        if (!metrics) {
          res.status(404).json({ error: 'Agent not found' });
          return;
        }
        res.json(metrics);
      } catch (error) {
        this.handleError(res, error);
      }
    });

    this.app.use('/api', router);

    // Root endpoint
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        service: 'Parallax Local Runtime',
        version: '0.1.0',
        endpoints: {
          health: '/api/health',
          agents: '/api/agents',
          websocket: {
            general: '/ws',
            events: '/ws/events',
            terminal: '/ws/agents/:id/terminal',
          },
        },
      });
    });
  }

  private setupRuntimeEvents(): void {
    // Broadcast events to WebSocket subscribers
    this.runtime.on('agent_started', (agent) => {
      this.broadcast('agent_started', { agent });
    });

    this.runtime.on('agent_ready', (agent) => {
      this.broadcast('agent_ready', { agent });
      this.broadcastToAgent(agent.id, 'ready', { agent });
    });

    this.runtime.on('agent_stopped', (agent, reason) => {
      this.broadcast('agent_stopped', { agent, reason });
      this.broadcastToAgent(agent.id, 'stopped', { agent, reason });
    });

    this.runtime.on('agent_error', (agent, error) => {
      this.broadcast('agent_error', { agent, error });
      this.broadcastToAgent(agent.id, 'error', { agent, error });
    });

    this.runtime.on('login_required', (agent, url) => {
      this.broadcast('login_required', { agent, url });
      this.broadcastToAgent(agent.id, 'login_required', { agent, url });
    });

    this.runtime.on('message', (message) => {
      this.broadcastToAgent(message.agentId, 'message', { message });
    });

    this.runtime.on('question', (agent, question) => {
      this.broadcast('question', { agent, question });
      this.broadcastToAgent(agent.id, 'question', { agent, question });
    });
  }

  private broadcast(event: string, data: any): void {
    if (!this.wss) return;

    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private broadcastToAgent(agentId: string, event: string, data: any): void {
    const subscribers = this.agentSubscribers.get(agentId);
    if (!subscribers) return;

    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

    subscribers.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private handleError(res: Response, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error({ error }, 'Request error');
    res.status(500).json({ error: message });
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    const { port, host = '0.0.0.0' } = this.options;

    this.server = createServer(this.app);

    // Set up WebSocket servers (noServer mode for path-based routing)
    this.wss = new WebSocketServer({ noServer: true });
    this.terminalWss = new WebSocketServer({ noServer: true });
    this.eventsWss = new WebSocketServer({ noServer: true });

    // Handle upgrade requests and route to appropriate WebSocket server
    this.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '/', `http://${request.headers.host}`);
      const pathname = url.pathname;

      this.logger.debug({ pathname }, 'WebSocket upgrade request');

      // Route: /ws/agents/:id/terminal - Raw terminal streaming
      const terminalMatch = pathname.match(/^\/ws\/agents\/([^/]+)\/terminal$/);
      if (terminalMatch) {
        const agentId = terminalMatch[1];
        this.terminalWss!.handleUpgrade(request, socket, head, (ws) => {
          this.terminalWss!.emit('connection', ws, request, agentId);
        });
        return;
      }

      // Route: /ws/events - Event stream
      if (pathname === '/ws/events') {
        this.eventsWss!.handleUpgrade(request, socket, head, (ws) => {
          this.eventsWss!.emit('connection', ws, request);
        });
        return;
      }

      // Route: /ws - General WebSocket (legacy)
      if (pathname === '/ws' || pathname === '/') {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
        return;
      }

      // Unknown path - close connection
      socket.destroy();
    });

    // Set up handlers for each WebSocket server
    this.setupGeneralWebSocket();
    this.setupTerminalWebSocket();
    this.setupEventsWebSocket();

    return new Promise((resolve) => {
      this.server!.listen(port, host, () => {
        this.logger.info({ port, host }, 'Runtime server listening');
        resolve();
      });
    });
  }

  /**
   * Set up general WebSocket handler (legacy /ws endpoint)
   */
  private setupGeneralWebSocket(): void {
    this.wss!.on('connection', (ws, req) => {
      this.logger.debug({ url: req.url }, 'General WebSocket connection');

      // Check if subscribing to specific agent
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const agentId = url.searchParams.get('agentId');

      if (agentId) {
        if (!this.agentSubscribers.has(agentId)) {
          this.agentSubscribers.set(agentId, new Set());
        }
        this.agentSubscribers.get(agentId)!.add(ws);

        ws.on('close', () => {
          this.agentSubscribers.get(agentId)?.delete(ws);
        });
      }

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'send' && msg.agentId && msg.message) {
            await this.runtime.send(msg.agentId, msg.message);
          }
        } catch (error) {
          this.logger.error({ error }, 'WebSocket message error');
        }
      });
    });
  }

  /**
   * Set up terminal WebSocket handler (/ws/agents/:id/terminal)
   * Streams raw PTY data for xterm.js integration
   */
  private setupTerminalWebSocket(): void {
    this.terminalWss!.on('connection', (ws: WebSocket, req: IncomingMessage, agentId: string) => {
      this.logger.info({ agentId }, 'Terminal WebSocket connection');

      // Attach to the agent's terminal
      const terminal = this.runtime.attachTerminal(agentId);

      if (!terminal) {
        this.logger.warn({ agentId }, 'Terminal attach failed - agent not found');
        ws.close(4404, 'Agent not found');
        return;
      }

      // Track connection
      if (!this.terminalConnections.has(agentId)) {
        this.terminalConnections.set(agentId, new Set());
      }
      this.terminalConnections.get(agentId)!.add(ws);

      // Send initial message
      ws.send(JSON.stringify({
        type: 'connected',
        agentId,
        timestamp: new Date().toISOString(),
      }));

      // Forward PTY output to WebSocket
      const unsubscribe = terminal.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          // Send raw terminal data as binary/text
          ws.send(data);
        }
      });

      // Handle incoming data from xterm.js
      ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const message = data.toString();

          // Check if it's a control message (JSON)
          if (message.startsWith('{')) {
            const ctrl = JSON.parse(message);

            if (ctrl.type === 'resize' && ctrl.cols && ctrl.rows) {
              terminal.resize(ctrl.cols, ctrl.rows);
              this.logger.debug({ agentId, cols: ctrl.cols, rows: ctrl.rows }, 'Terminal resized');
            }
          } else {
            // Raw terminal input - write directly to PTY
            terminal.write(message);
          }
        } catch {
          // Not JSON, treat as raw input
          terminal.write(data.toString());
        }
      });

      // Clean up on close
      ws.on('close', () => {
        this.logger.info({ agentId }, 'Terminal WebSocket disconnected');
        unsubscribe();
        this.terminalConnections.get(agentId)?.delete(ws);
      });

      ws.on('error', (error: Error) => {
        this.logger.error({ agentId, error }, 'Terminal WebSocket error');
        unsubscribe();
      });
    });
  }

  /**
   * Set up events WebSocket handler (/ws/events)
   * Streams JSON events for agent lifecycle
   */
  private setupEventsWebSocket(): void {
    this.eventsWss!.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.logger.info('Events WebSocket connection');

      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const agentIdFilter = url.searchParams.get('agentId');

      // Send initial message
      ws.send(JSON.stringify({
        type: 'connected',
        filter: agentIdFilter ? { agentId: agentIdFilter } : null,
        timestamp: new Date().toISOString(),
      }));

      // Helper to send event if it matches filter
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        // If filtering by agentId, check if event matches
        if (agentIdFilter) {
          const agent = data.agent as { id?: string } | undefined;
          const message = data.message as { agentId?: string } | undefined;
          const eventAgentId = agent?.id || data.agentId || message?.agentId;
          if (eventAgentId && eventAgentId !== agentIdFilter) return;
        }

        ws.send(JSON.stringify({
          event,
          data,
          timestamp: new Date().toISOString(),
        }));
      };

      // Subscribe to runtime events
      const handlers: Record<string, (...args: unknown[]) => void> = {
        agent_started: (agent: unknown) => sendEvent('agent_started', { agent }),
        agent_ready: (agent: unknown) => sendEvent('agent_ready', { agent }),
        agent_stopped: (agent: unknown, reason: unknown) => sendEvent('agent_stopped', { agent, reason: reason as string }),
        agent_error: (agent: unknown, error: unknown) => sendEvent('agent_error', { agent, error: error as string }),
        login_required: (agent: unknown, loginUrl: unknown) => sendEvent('login_required', { agent, loginUrl: loginUrl as string }),
        message: (message: unknown) => sendEvent('message', { message }),
        question: (agent: unknown, question: unknown) => sendEvent('question', { agent, question: question as string }),
      };

      // Attach all handlers
      for (const [event, handler] of Object.entries(handlers)) {
        this.runtime.on(event, handler);
      }

      // Handle client messages
      ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const msg = JSON.parse(data.toString());

          // Ping/pong for keepalive
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch (error) {
          this.logger.error({ error }, 'Events WebSocket message error');
        }
      });

      // Clean up on close
      ws.on('close', () => {
        this.logger.info('Events WebSocket disconnected');
        for (const [event, handler] of Object.entries(handlers)) {
          this.runtime.off(event, handler);
        }
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    // Close all WebSocket servers
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.terminalWss) {
      this.terminalWss.close();
      this.terminalWss = null;
    }

    if (this.eventsWss) {
      this.eventsWss.close();
      this.eventsWss = null;
    }

    // Clear connection tracking
    this.agentSubscribers.clear();
    this.terminalConnections.clear();

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }
}
