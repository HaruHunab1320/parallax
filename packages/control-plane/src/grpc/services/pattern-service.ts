/**
 * gRPC Pattern Service implementation
 */

import * as grpc from '@grpc/grpc-js';
import { IPatternEngine } from '../../pattern-engine/interfaces';
import { DatabaseService } from '../../db/database.service';
import { Logger } from 'pino';
import { Pattern } from '../../pattern-engine/types';

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
      const { pattern_name, input, input_json, parameters, options } = call.request;
      
      this.logger.info({ pattern: pattern_name }, 'Executing pattern via gRPC');
      
      const parsedInput = input_json ? JSON.parse(input_json) : (input || {});
      
      // Execute pattern
      const result = await this.patternEngine.executePattern(
        pattern_name,
        {
          ...parsedInput,
          ...(parameters || {})
        },
        { timeout: options?.timeout_ms ?? 30000 }
      );

      callback(null, this.toExecuteResponse(result, pattern_name));
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
      const { pattern_name, input, input_json, parameters, options } = call.request;
      
      this.logger.info({ pattern: pattern_name }, 'Stream executing pattern via gRPC');
      
      const parsedInput = input_json ? JSON.parse(input_json) : (input || {});
      
      // Execute pattern (best-effort streaming until engine supports progress events)
      const result = await this.patternEngine.executePattern(
        pattern_name,
        {
          ...parsedInput,
          ...(parameters || {})
        },
        { timeout: options?.timeout_ms ?? 30000 }
      );
      
      call.write(this.toExecuteResponse(result, pattern_name));
      
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
      const includeScripts = Boolean(call.request?.include_scripts);
      const patterns = await this.patternEngine.listPatterns();
      
      // Convert to proto format
      const protoPatterns = patterns.map(pattern => ({
        name: pattern.name,
        version: pattern.version || '1.0.0',
        description: pattern.description || '',
        requirements: {
          capabilities: pattern.agents?.capabilities || [],
          min_agents: pattern.minAgents || 0,
          max_agents: pattern.maxAgents || 0,
          min_confidence: pattern.agents?.minConfidence || 0
        },
        prism_script: includeScripts ? pattern.script : '',
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
        version: pattern.version || '1.0.0',
        description: pattern.description || '',
        requirements: {
          capabilities: pattern.agents?.capabilities || [],
          min_agents: pattern.minAgents || 0,
          max_agents: pattern.maxAgents || 0,
          min_confidence: pattern.agents?.minConfidence || 0
        },
        prism_script: pattern.script || '',
        metadata: pattern.metadata || {}
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
    try {
      const requestPattern = call.request.pattern;
      if (!requestPattern) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Missing pattern payload'
        });
        return;
      }

      const name = requestPattern.name;
      const script = requestPattern.prism_script;

      if (!name || !script) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Pattern name and prism_script are required'
        });
        return;
      }

      const pattern: Pattern = {
        name,
        version: requestPattern.version || '1.0.0',
        description: requestPattern.description || '',
        input: { type: 'any' },
        agents: {
          capabilities: requestPattern.requirements?.capabilities || [],
          minConfidence: requestPattern.requirements?.min_confidence
        },
        minAgents: requestPattern.requirements?.min_agents,
        maxAgents: requestPattern.requirements?.max_agents,
        script,
        metadata: requestPattern.metadata || {}
      };

      const saved = await this.patternEngine.savePattern(pattern, {
        overwrite: Boolean(call.request.overwrite)
      });

      callback(null, {
        success: true,
        message: 'Pattern uploaded',
        pattern_id: saved.name
      });
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        callback({
          code: grpc.status.ALREADY_EXISTS,
          details: error.message
        });
        return;
      }
      this.logger.error({ error }, 'Failed to upload pattern');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  private toExecuteResponse(result: any, patternName: string): any {
    const status = result.status === 'failed' ? 'FAILURE' : result.status === 'completed' ? 'SUCCESS' : 'UNKNOWN';
    const confidence = result.confidence ?? result.metrics?.averageConfidence ?? result.metrics?.confidence ?? 0;

    return {
      execution_id: result.id,
      pattern_name: patternName,
      status,
      result: result.result || {},
      confidence,
      metrics: {
        start_time: this.toTimestamp(result.startTime),
        end_time: result.endTime ? this.toTimestamp(result.endTime) : undefined,
        agents_used: result.metrics?.agentsUsed || result.metrics?.agentCount || 0,
        parallel_paths: result.metrics?.parallelPaths || 0,
        average_confidence: result.metrics?.averageConfidence || 0
      },
      agent_results: [],
      error_message: result.error || ''
    };
  }

  private toTimestamp(date: Date): { seconds: number; nanos: number } {
    return {
      seconds: Math.floor(date.getTime() / 1000),
      nanos: 0
    };
  }
}
