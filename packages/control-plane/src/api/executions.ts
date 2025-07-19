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
  router.get('/', async (_req, res) => {
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
  router.get('/:id', async (req, res) => {
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

  // Create new execution
  router.post('/', async (req, res) => {
    const { patternName, input, options } = req.body as ExecutionRequest;
    
    if (!patternName || !input) {
      return res.status(400).json({ 
        error: 'Missing required fields: patternName, input' 
      });
    }
    
    try {
      // Create execution ID
      const executionId = uuidv4();
      
      // Store in database if available
      if (database) {
        const dbExecutionId = await createExecutionInDb(
          database,
          patternName,
          input,
          options
        );
        
        // Start async execution
        patternEngine.executePattern(patternName, input, options)
          .then(async (result) => {
            await updateExecutionInDb(database, dbExecutionId, {
              status: 'completed',
              result: result.result,
              confidence: result.metrics?.confidence,
              durationMs: result.endTime 
                ? new Date(result.endTime).getTime() - new Date(result.startTime).getTime()
                : undefined
            });
            
            // Notify WebSocket clients
            const streams = activeStreams.get(dbExecutionId);
            if (streams) {
              const message = JSON.stringify({
                type: 'completed',
                execution: result
              });
              streams.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(message);
                  ws.close();
                }
              });
              activeStreams.delete(dbExecutionId);
            }
          })
          .catch(async (error) => {
            await updateExecutionInDb(database, dbExecutionId, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            // Notify WebSocket clients
            const streams = activeStreams.get(dbExecutionId);
            if (streams) {
              const message = JSON.stringify({
                type: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error'
              });
              streams.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(message);
                  ws.close();
                }
              });
              activeStreams.delete(dbExecutionId);
            }
          });
        
        return res.status(202).json({
          id: dbExecutionId,
          status: 'accepted',
          message: 'Execution started',
          streamUrl: options?.stream ? `/api/executions/${dbExecutionId}/stream` : undefined
        });
      } else {
        // Fallback to in-memory
        const execution = {
          id: executionId,
          patternName,
          input,
          status: 'running',
          startTime: new Date().toISOString()
        };
        
        executions.set(executionId, execution);
        
        // Start async execution
        patternEngine.executePattern(patternName, input, options)
          .then((result) => {
            executions.set(executionId, {
              ...execution,
              ...result,
              status: 'completed'
            });
          })
          .catch((error) => {
            executions.set(executionId, {
              ...execution,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          });
        
        return res.status(202).json({
          id: executionId,
          status: 'accepted',
          message: 'Execution started',
          streamUrl: options?.stream ? `/api/executions/${executionId}/stream` : undefined
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
  router.get('/:id/events', async (req, res) => {
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
  router.post('/:id/cancel', async (req, res) => {
    const { id } = req.params;
    
    try {
      if (database) {
        await updateExecutionInDb(database, id, {
          status: 'cancelled'
        });
      } else {
        const execution = executions.get(id);
        if (execution) {
          execution.status = 'cancelled';
        }
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
  router.post('/:id/retry', async (req, res) => {
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
      
      // Create new execution with same parameters
      const retryRequest: ExecutionRequest = {
        patternName: originalExecution.patternName,
        input: originalExecution.input,
        options: originalExecution.options
      };
      
      // Forward to create endpoint
      req.body = retryRequest;
      return router.handle(req, res);
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
    
    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  };
}