/**
 * gRPC Pattern Service implementation
 */

import * as grpc from '@grpc/grpc-js';
import { IPatternEngine } from '../../pattern-engine/interfaces';
import { DatabaseService } from '../../db/database.service';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';

export class PatternServiceImpl {
  constructor(
    private patternEngine: IPatternEngine,
    private database: DatabaseService,
    private logger: Logger
  ) {}

  getImplementation() {
    return {
      executePattern: this.executePattern.bind(this),
      streamExecutePattern: this.streamExecutePattern.bind(this),
      listPatterns: this.listPatterns.bind(this),
      getPattern: this.getPattern.bind(this),
      uploadPattern: this.uploadPattern.bind(this)
    };
  }

  async executePattern(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { pattern_name, input_json, parameters } = call.request;
      
      this.logger.info({ pattern: pattern_name }, 'Executing pattern via gRPC');
      
      // Parse input
      const input = input_json ? JSON.parse(input_json) : {};
      
      // Create execution ID
      const executionId = uuidv4();
      
      // Execute pattern
      const result = await this.patternEngine.executePattern(
        pattern_name,
        {
          ...input,
          ...parameters
        },
        { timeout: 30000 }
      );
      
      // Create execution record
      const execution = {
        id: result.id,
        pattern: pattern_name,
        input: input_json,
        status: result.status === 'failed' ? 'FAILED' : 'COMPLETED',
        result: {
          value_json: JSON.stringify(result.result || {}),
          confidence: result.confidence || 0,
          agent_id: result.result?.agentId || '',
          timestamp: {
            seconds: Math.floor(result.startTime.getTime() / 1000),
            nanos: 0
          },
          reasoning: result.result?.reasoning || '',
          metadata: result.result?.metadata || {}
        },
        created_at: {
          seconds: Math.floor(result.startTime.getTime() / 1000),
          nanos: 0
        },
        completed_at: result.endTime ? {
          seconds: Math.floor(result.endTime.getTime() / 1000),
          nanos: 0
        } : undefined,
        metadata: result.metrics || {},
        error: result.error
      };
      
      callback(null, { execution });
    } catch (error) {
      this.logger.error({ error }, 'Failed to execute pattern');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async streamExecutePattern(call: grpc.ServerWritableStream<any, any>) {
    try {
      const { pattern_name, input_json, parameters } = call.request;
      
      this.logger.info({ pattern: pattern_name }, 'Stream executing pattern via gRPC');
      
      // Parse input
      const input = input_json ? JSON.parse(input_json) : {};
      const executionId = uuidv4();
      
      // Send initial status
      call.write({
        execution: {
          id: executionId,
          pattern: pattern_name,
          status: 'RUNNING',
          created_at: {
            seconds: Math.floor(Date.now() / 1000),
            nanos: 0
          }
        }
      });
      
      // Execute pattern (TODO: Add streaming support to pattern engine)
      const result = await this.patternEngine.executePattern(
        pattern_name,
        {
          ...input,
          ...parameters
        },
        { timeout: 30000 }
      );
      
      // Send final result
      call.write({
        execution: {
          id: result.id,
          pattern: pattern_name,
          status: result.status === 'failed' ? 'FAILED' : 'COMPLETED',
          result: {
            value_json: JSON.stringify(result.result || {}),
            confidence: result.confidence || 0,
            agent_id: result.result?.agentId || '',
            timestamp: {
              seconds: Math.floor(result.startTime.getTime() / 1000),
              nanos: 0
            },
            reasoning: result.result?.reasoning || '',
            metadata: result.result?.metadata || {}
          },
          completed_at: result.endTime ? {
            seconds: Math.floor(result.endTime.getTime() / 1000),
            nanos: 0
          } : undefined,
          error: result.error
        }
      });
      
      call.end();
    } catch (error) {
      this.logger.error({ error }, 'Failed to stream execute pattern');
      call.emit('error', {
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async listPatterns(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const patterns = await this.patternEngine.listPatterns();
      
      // Convert to proto format
      const protoPatterns = patterns.map(pattern => ({
        name: pattern.name,
        description: pattern.description || '',
        version: pattern.version || '1.0.0',
        author: pattern.metadata?.author || 'unknown',
        tags: pattern.metadata?.tags || [],
        parameters: pattern.input || {},
        capabilities_required: pattern.agents?.capabilities || [],
        confidence_threshold: pattern.agents?.minConfidence || 0.7,
        created_at: {
          seconds: Math.floor(Date.now() / 1000),
          nanos: 0
        },
        metadata: pattern.metadata || {}
      }));
      
      callback(null, { patterns: protoPatterns });
    } catch (error) {
      this.logger.error({ error }, 'Failed to list patterns');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async getPattern(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { name } = call.request;
      const patterns = await this.patternEngine.listPatterns();
      const pattern = patterns.find(p => p.name === name);
      
      if (!pattern) {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'Pattern not found'
        });
        return;
      }
      
      const protoPattern = {
        name: pattern.name,
        description: pattern.description || '',
        version: pattern.version || '1.0.0',
        author: pattern.metadata?.author || 'unknown',
        tags: pattern.metadata?.tags || [],
        parameters: pattern.input || {},
        capabilities_required: pattern.agents?.capabilities || [],
        confidence_threshold: pattern.agents?.minConfidence || 0.7,
        created_at: {
          seconds: Math.floor(Date.now() / 1000),
          nanos: 0
        },
        metadata: pattern.metadata || {},
        source: pattern.script || ''
      };
      
      callback(null, { pattern: protoPattern });
    } catch (error) {
      this.logger.error({ error }, 'Failed to get pattern');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async uploadPattern(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    // For now, return UNIMPLEMENTED
    // TODO: Implement pattern upload functionality
    callback({
      code: grpc.status.UNIMPLEMENTED,
      details: 'Pattern upload not yet implemented'
    });
  }
}