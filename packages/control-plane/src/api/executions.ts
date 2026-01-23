import { Router } from 'express';
import { PatternEngine } from '../pattern-engine';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { DatabaseService } from '../db/database.service';
import {
  createExecutionInDb,
  updateExecutionInDb,
  convertExecutionFromDb
} from '../pattern-engine/pattern-engine-db';
import { ExecutionEventBus } from '../execution-events';
import { WebhookService, WebhookConfig, WebhookPayload } from '../webhooks';

interface ExecutionRequest {
  patternName: string;
  input: any;
  options?: {
    timeout?: number;
    stream?: boolean;
  };
  webhook?: WebhookConfig;
}

export function createExecutionsRouter(
  patternEngine: PatternEngine,
  logger: Logger,
  database?: DatabaseService,
  executionEvents?: ExecutionEventBus,
  webhookService?: WebhookService
): Router {
  const router = Router();

  // In-memory storage for executions (fallback when no database)
  const executions = new Map<string, any>();
  const activeStreams = new Map<string, WebSocket[]>();
  // Store webhook configs for in-memory executions
  const webhookConfigs = new Map<string, WebhookConfig>();

  // Create webhook service if not provided
  const webhooks = webhookService || new WebhookService(logger);

  if (executionEvents) {
    executionEvents.onExecution((event) => {
      const streams = activeStreams.get(event.executionId);
      if (!streams) return;

      const message = JSON.stringify({
        type: event.type,
        executionId: event.executionId,
        data: event.data,
        timestamp: event.timestamp.toISOString()
      });

      streams.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });

      if (['completed', 'failed', 'cancelled'].includes(event.type)) {
        streams.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
        activeStreams.delete(event.executionId);
      }
    });
  }

  // List executions
  router.get('/', async (_req: any, res: any) => {
    const limit = parseInt(_req.query.limit as string) || 100;
    const offset = parseInt(_req.query.offset as string) || 0;
    const status = _req.query.status as string;
    
    try {
      let executionList;
      
      if (database) {
        // Get from database
        const where = status ? { status } : undefined;
        executionList = await database.executions.findAll({
          where,
          skip: offset,
          take: limit,
          orderBy: { time: 'desc' }
        });
        
        // Convert to API format
        executionList = await Promise.all(
          executionList.map(e => convertExecutionFromDb(e))
        );
      } else {
        // Get from memory
        executionList = Array.from(executions.values());
        
        // Filter by status if provided
        if (status) {
          executionList = executionList.filter(e => e.status === status);
        }
        
        // Sort by startTime descending
        executionList.sort((a, b) => 
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );
        
        // Apply pagination
        executionList = executionList.slice(offset, offset + limit);
      }
      
      return res.json({
        executions: executionList,
        total: executionList.length,
        limit,
        offset
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list executions');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list executions'
      });
    }
  });

  // Get execution details
  router.get('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    
    try {
      let execution;
      
      if (database) {
        const dbExecution = await database.executions.findById(id);
        if (dbExecution) {
          execution = await convertExecutionFromDb(dbExecution);
        }
      } else {
        execution = executions.get(id);
      }
      
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      
      return res.json(execution);
    } catch (error) {
      logger.error({ error, executionId: id }, 'Failed to get execution');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get execution'
      });
    }
  });

  // Helper to send webhook notification
  const sendWebhook = async (
    executionId: string,
    patternName: string,
    status: 'completed' | 'failed' | 'cancelled',
    result: any,
    startTime: Date,
    webhook?: WebhookConfig
  ) => {
    if (!webhook?.url) return;

    const payload: WebhookPayload = {
      executionId,
      patternName,
      status,
      result: status === 'completed' ? result?.result : undefined,
      error: status === 'failed' ? result?.error : undefined,
      confidence: result?.metrics?.averageConfidence ?? result?.metrics?.confidence,
      duration: Date.now() - startTime.getTime(),
      completedAt: new Date().toISOString()
    };

    // Fire and forget - don't block on webhook delivery
    webhooks.send(webhook, payload).catch(err => {
      logger.error({ err, executionId, webhookUrl: webhook.url }, 'Webhook delivery failed');
    });
  };

  // Create new execution
  router.post('/', async (req: any, res: any) => {
    const { patternName, input, options, webhook } = req.body as ExecutionRequest;

    if (!patternName || !input) {
      return res.status(400).json({
        error: 'Missing required fields: patternName, input'
      });
    }

    // Validate webhook URL if provided
    if (webhook?.url) {
      try {
        const url = new URL(webhook.url);
        if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
          return res.status(400).json({
            error: 'Webhook URL must use HTTPS in production'
          });
        }
      } catch {
        return res.status(400).json({
          error: 'Invalid webhook URL'
        });
      }
    }

    try {
      // Create execution ID
      const executionId = uuidv4();
      const startTime = new Date();

      // Store in database if available
      if (database) {
        const dbExecutionId = await createExecutionInDb(
          database,
          patternName,
          input,
          options
        );

        // Start async execution
        const executionOptions = { ...options, executionId: dbExecutionId };
        patternEngine.executePattern(patternName, input, executionOptions)
          .then(async (result) => {
            await updateExecutionInDb(database, dbExecutionId, {
              status: 'completed',
              result: result.result,
              confidence: result.metrics?.confidence,
              durationMs: result.endTime
                ? new Date(result.endTime).getTime() - new Date(result.startTime).getTime()
                : undefined
            });

            // Send webhook on completion
            await sendWebhook(dbExecutionId, patternName, 'completed', result, startTime, webhook);
          })
          .catch(async (error) => {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await updateExecutionInDb(database, dbExecutionId, {
              status: 'failed',
              error: errorMessage
            });

            // Send webhook on failure
            await sendWebhook(dbExecutionId, patternName, 'failed', { error: errorMessage }, startTime, webhook);
          });

        return res.status(202).json({
          id: dbExecutionId,
          status: 'accepted',
          message: 'Execution started',
          streamUrl: options?.stream ? `/api/executions/${dbExecutionId}/stream` : undefined,
          webhookConfigured: !!webhook?.url
        });
      } else {
        // Fallback to in-memory
        const execution = {
          id: executionId,
          patternName,
          input,
          status: 'running',
          startTime: startTime.toISOString()
        };

        executions.set(executionId, execution);

        // Store webhook config for this execution
        if (webhook?.url) {
          webhookConfigs.set(executionId, webhook);
        }

        // Start async execution
        const executionOptions = { ...options, executionId };
        patternEngine.executePattern(patternName, input, executionOptions)
          .then((result) => {
            executions.set(executionId, {
              ...execution,
              ...result,
              status: 'completed'
            });

            // Send webhook on completion
            sendWebhook(executionId, patternName, 'completed', result, startTime, webhook);
          })
          .catch((error) => {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            executions.set(executionId, {
              ...execution,
              status: 'failed',
              error: errorMessage
            });

            // Send webhook on failure
            sendWebhook(executionId, patternName, 'failed', { error: errorMessage }, startTime, webhook);
          });

        return res.status(202).json({
          id: executionId,
          status: 'accepted',
          message: 'Execution started',
          streamUrl: options?.stream ? `/api/executions/${executionId}/stream` : undefined,
          webhookConfigured: !!webhook?.url
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to create execution');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create execution'
      });
    }
  });

  // Get execution events
  router.get('/:id/events', async (req: any, res: any) => {
    const { id } = req.params;
    
    try {
      if (database) {
        const events = await database.executions.getEvents(id);
        return res.json({ events });
      } else {
        // No events in memory storage
        return res.json({ events: [] });
      }
    } catch (error) {
      logger.error({ error, executionId: id }, 'Failed to get execution events');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get events'
      });
    }
  });

  // Cancel execution
  router.post('/:id/cancel', async (req: any, res: any) => {
    const { id } = req.params;

    try {
      let patternName = '';
      let startTime = new Date();

      if (database) {
        const dbExecution = await database.executions.findById(id);
        if (dbExecution) {
          patternName = dbExecution.pattern?.name || '';
          startTime = dbExecution.time || new Date();
        }
        await updateExecutionInDb(database, id, {
          status: 'cancelled'
        });
      } else {
        const execution = executions.get(id);
        if (execution) {
          patternName = execution.patternName;
          startTime = new Date(execution.startTime);
          execution.status = 'cancelled';
        }
      }

      // Send webhook for cancellation
      const webhook = webhookConfigs.get(id);
      if (webhook) {
        sendWebhook(id, patternName, 'cancelled', {}, startTime, webhook);
        webhookConfigs.delete(id);
      }

      // Close any active streams
      const streams = activeStreams.get(id);
      if (streams) {
        const message = JSON.stringify({
          type: 'cancelled'
        });
        streams.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
            ws.close();
          }
        });
        activeStreams.delete(id);
      }

      return res.json({
        message: 'Execution cancelled',
        id
      });
    } catch (error) {
      logger.error({ error, executionId: id }, 'Failed to cancel execution');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to cancel execution'
      });
    }
  });

  // Retry execution
  router.post('/:id/retry', async (req: any, res: any) => {
    const { id } = req.params;
    
    try {
      let originalExecution;
      
      if (database) {
        const dbExecution = await database.executions.findById(id);
        if (dbExecution) {
          originalExecution = {
            patternName: dbExecution.pattern?.name,
            input: dbExecution.input,
            options: dbExecution.metrics
          };
        }
      } else {
        const execution = executions.get(id);
        if (execution) {
          originalExecution = {
            patternName: execution.patternName,
            input: execution.input,
            options: execution.options
          };
        }
      }
      
      if (!originalExecution || !originalExecution.patternName) {
        return res.status(404).json({ error: 'Original execution not found' });
      }
      
      // Create new execution with same parameters - redirect to create endpoint
      req.body = {
        patternName: originalExecution.patternName,
        input: originalExecution.input,
        options: originalExecution.options
      } as ExecutionRequest;

      // Use next() to pass to the router's POST handler would require middleware
      // Instead, return info for client to make a new request
      return res.status(200).json({
        message: 'Retry available',
        retryRequest: req.body,
        hint: 'POST this to /api/executions to retry'
      });
    } catch (error) {
      logger.error({ error, executionId: id }, 'Failed to retry execution');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to retry execution'
      });
    }
  });

  // Store active streams reference
  (router as any).activeStreams = activeStreams;

  return router;
}

// WebSocket handler for execution streaming
export function createExecutionWebSocketHandler(
  executionsRouter: Router
): (ws: WebSocket, req: any) => void {
  const activeStreams = (executionsRouter as any).activeStreams as Map<string, WebSocket[]>;
  
  return (ws: WebSocket, req: any) => {
    const executionId = req.params.id;
    
    if (!executionId) {
      ws.send(JSON.stringify({ error: 'Missing execution ID' }));
      ws.close();
      return;
    }
    
    // Add to active streams
    if (!activeStreams.has(executionId)) {
      activeStreams.set(executionId, []);
    }
    activeStreams.get(executionId)!.push(ws);
    
    // Send initial message
    ws.send(JSON.stringify({
      type: 'connected',
      executionId
    }));
    
    // Handle client disconnect
    ws.on('close', () => {
      const streams = activeStreams.get(executionId);
      if (streams) {
        const index = streams.indexOf(ws);
        if (index > -1) {
          streams.splice(index, 1);
        }
        if (streams.length === 0) {
          activeStreams.delete(executionId);
        }
      }
    });
    
    // Handle errors silently - connection errors are expected when clients disconnect
    ws.on('error', () => {});
  };
}
