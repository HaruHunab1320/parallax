import { Router } from 'express';
import { PatternEngine } from '../pattern-engine';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { Server } from 'http';
import { DatabaseService } from '../db/database.service';
import { 
  createExecutionInDb, 
  updateExecutionInDb, 
  convertExecutionFromDb 
} from '../pattern-engine/pattern-engine-db';

interface ExecutionRequest {
  patternName: string;
  input: any;
  options?: {
    timeout?: number;
    stream?: boolean;
  };
}

export function createExecutionsRouter(
  patternEngine: PatternEngine,
  logger: Logger,
  database?: DatabaseService
): Router {
  const router = Router();
  
  // In-memory storage for executions (fallback when no database)
  const executions = new Map<string, any>();
  const activeStreams = new Map<string, WebSocket[]>();

  // List executions
  router.get('/', (_req, res) => {
    const limit = parseInt(_req.query.limit as string) || 100;
    const offset = parseInt(_req.query.offset as string) || 0;
    const status = _req.query.status as string;
    
    let executionList = Array.from(executions.values());
    
    // Filter by status if provided
    if (status) {
      executionList = executionList.filter(e => e.status === status);
    }
    
    // Sort by startTime descending
    executionList.sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
    
    // Paginate
    const total = executionList.length;
    executionList = executionList.slice(offset, offset + limit);
    
    res.json({
      executions: executionList,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    });
  });

  // Get execution details
  router.get('/:id', (req, res) => {
    const { id } = req.params;
    const execution = executions.get(id);
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    res.json(execution);
  });

  // Create new execution
  router.post('/', async (req, res) => {
    const { patternName, input, options = {} } = req.body as ExecutionRequest;
    
    if (!patternName) {
      return res.status(400).json({ error: 'Pattern name is required' });
    }
    
    const executionId = uuidv4();
    const execution = {
      id: executionId,
      patternName,
      input,
      status: 'pending',
      startTime: new Date().toISOString(),
      endTime: null,
      result: null,
      error: null,
      metrics: null,
      confidence: null,
      warnings: []
    };
    
    executions.set(executionId, execution);
    
    // Return execution ID immediately
    res.status(202).json({
      executionId,
      status: 'pending',
      message: 'Execution started',
      links: {
        self: `/api/executions/${executionId}`,
        stream: options.stream ? `/api/executions/${executionId}/stream` : undefined
      }
    });
    
    // Execute pattern asynchronously
    executePatternAsync(executionId, execution, patternEngine, logger);
  });

  // Cancel execution
  router.post('/:id/cancel', (req, res) => {
    const { id } = req.params;
    const execution = executions.get(id);
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    if (execution.status !== 'running') {
      return res.status(400).json({ 
        error: 'Can only cancel running executions',
        currentStatus: execution.status 
      });
    }
    
    // TODO: Implement actual cancellation mechanism
    execution.status = 'cancelled';
    execution.endTime = new Date().toISOString();
    
    // Notify WebSocket clients
    notifyStreamClients(id, {
      type: 'status',
      status: 'cancelled',
      timestamp: execution.endTime
    });
    
    res.json({
      message: 'Execution cancelled',
      executionId: id
    });
  });

  // Get execution logs/events
  router.get('/:id/events', (req, res) => {
    const { id } = req.params;
    const execution = executions.get(id);
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    // TODO: Implement event storage
    res.json({
      executionId: id,
      events: execution.events || [],
      message: 'Event tracking not yet implemented'
    });
  });

  // Retry failed execution
  router.post('/:id/retry', async (req, res) => {
    const { id } = req.params;
    const execution = executions.get(id);
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    if (execution.status !== 'failed') {
      return res.status(400).json({ 
        error: 'Can only retry failed executions',
        currentStatus: execution.status 
      });
    }
    
    // Create new execution with same parameters
    const retryId = uuidv4();
    const retryExecution = {
      ...execution,
      id: retryId,
      status: 'pending',
      startTime: new Date().toISOString(),
      endTime: null,
      result: null,
      error: null,
      originalExecutionId: id
    };
    
    executions.set(retryId, retryExecution);
    
    res.status(202).json({
      executionId: retryId,
      originalExecutionId: id,
      status: 'pending',
      message: 'Retry started'
    });
    
    // Execute pattern asynchronously
    executePatternAsync(retryId, retryExecution, patternEngine, logger);
  });

  // Helper function to execute pattern asynchronously
  async function executePatternAsync(
    executionId: string,
    execution: any,
    engine: PatternEngine,
    log: Logger
  ) {
    try {
      // Update status to running
      execution.status = 'running';
      notifyStreamClients(executionId, {
        type: 'status',
        status: 'running',
        timestamp: new Date().toISOString()
      });
      
      // Execute pattern
      const result = await engine.executePattern(
        execution.patternName,
        execution.input,
        execution.options
      );
      
      // Update execution with results
      execution.status = result.status;
      execution.endTime = result.endTime || new Date().toISOString();
      execution.result = result.result;
      execution.error = result.error;
      execution.metrics = result.metrics;
      execution.confidence = result.confidence;
      execution.warnings = result.warnings;
      
      // Notify WebSocket clients
      notifyStreamClients(executionId, {
        type: 'complete',
        execution
      });
      
    } catch (error) {
      log.error({ error, executionId }, 'Pattern execution failed');
      
      execution.status = 'failed';
      execution.endTime = new Date().toISOString();
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      
      // Notify WebSocket clients
      notifyStreamClients(executionId, {
        type: 'error',
        error: execution.error,
        timestamp: execution.endTime
      });
    }
  }

  // Helper to notify WebSocket clients
  function notifyStreamClients(executionId: string, message: any) {
    const clients = activeStreams.get(executionId) || [];
    const messageStr = JSON.stringify(message);
    
    clients.forEach((ws, index) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      } else {
        // Remove closed connections
        clients.splice(index, 1);
      }
    });
    
    // Clean up if no more clients
    if (clients.length === 0) {
      activeStreams.delete(executionId);
    }
  }

  // Store active streams map for WebSocket handler
  (router as any).activeStreams = activeStreams;
  (router as any).executions = executions;

  return router;
}

// WebSocket handler for streaming execution updates
export function createExecutionWebSocketHandler(
  server: Server,
  executionsRouter: any,
  logger: Logger
) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/api/executions/stream'
  });

  wss.on('connection', (ws: WebSocket, request) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const executionId = url.searchParams.get('executionId');
    
    if (!executionId) {
      ws.send(JSON.stringify({ error: 'Execution ID required' }));
      ws.close();
      return;
    }
    
    const execution = executionsRouter.executions.get(executionId);
    if (!execution) {
      ws.send(JSON.stringify({ error: 'Execution not found' }));
      ws.close();
      return;
    }
    
    // Add client to active streams
    const clients = executionsRouter.activeStreams.get(executionId) || [];
    clients.push(ws);
    executionsRouter.activeStreams.set(executionId, clients);
    
    // Send current execution state
    ws.send(JSON.stringify({
      type: 'initial',
      execution
    }));
    
    // Handle client disconnect
    ws.on('close', () => {
      const clients = executionsRouter.activeStreams.get(executionId) || [];
      const index = clients.indexOf(ws);
      if (index > -1) {
        clients.splice(index, 1);
      }
    });
    
    ws.on('error', (error) => {
      logger.error({ error, executionId }, 'WebSocket error');
    });
  });

  return wss;
}