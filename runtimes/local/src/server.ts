/**
 * Local Runtime HTTP Server
 *
 * REST API for managing local CLI agent sessions.
 */

import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
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
  private agentSubscribers: Map<string, Set<WebSocket>> = new Map();

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
          websocket: '/ws',
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

    // Set up WebSocket server
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws, req) => {
      this.logger.debug({ url: req.url }, 'WebSocket connection');

      // Check if subscribing to specific agent
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const agentId = url.searchParams.get('agentId');

      if (agentId) {
        // Subscribe to specific agent
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

          // Handle WebSocket commands
          if (msg.type === 'send' && msg.agentId && msg.message) {
            await this.runtime.send(msg.agentId, msg.message);
          }
        } catch (error) {
          this.logger.error({ error }, 'WebSocket message error');
        }
      });
    });

    return new Promise((resolve) => {
      this.server!.listen(port, host, () => {
        this.logger.info({ port, host }, 'Runtime server listening');
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

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
