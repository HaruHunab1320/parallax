/**
 * gRPC Coordinator Service implementation
 */

import * as grpc from '@grpc/grpc-js';
import { IPatternEngine } from '../../pattern-engine/interfaces';
import type { IAgentRegistry } from '../../registry';
import { Logger } from 'pino';

export class CoordinatorServiceImpl {
  private history: Array<{ request: any; response: any; timestamp: number }> = [];

  constructor(
    private patternEngine: IPatternEngine,
    private agentRegistry: IAgentRegistry,
    private logger: Logger
  ) {}

  getImplementation() {
    return {
      coordinate: this.coordinate.bind(this),
      streamCoordinate: this.streamCoordinate.bind(this),
      getHistory: this.getHistory.bind(this)
    };
  }

  async coordinate(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { task_id, description, strategy, custom_pattern, data, constraints } = call.request;
      
      this.logger.info({ taskId: task_id, strategy }, 'Coordinating agents via gRPC');
      
      // Map strategy to pattern name
      const patternMap: Record<string, string> = {
        'CONSENSUS': 'ConsensusVoting',
        'EPISTEMIC': 'EpistemicEnsemble',
        'CASCADE': 'HierarchicalCascade',
        'QUALITY_OF_SERVICE': 'QualityOfService',
        'DEBATE': 'DebateConsensus',
        'MAP_REDUCE': 'MapReduce',
        'HIERARCHICAL': 'HierarchicalAggregation',
        'GRAPH': 'GraphConsensus',
        'RETRY': 'FaultTolerantRetry',
        'PIPELINE': 'DataPipeline',
        'AUCTION': 'MarketBasedAllocation'
      };
      
      const pattern = strategy === 'CUSTOM' && custom_pattern ? custom_pattern : (patternMap[strategy] || 'SimpleConsensus');
      
      const input = {
        task: description,
        data: data || {},
        strategy,
        constraints: constraints || {}
      };
      
      // Execute coordination pattern
      const result = await this.patternEngine.executePattern(
        pattern,
        input,
        { timeout: 30000 }
      );
      
      const response: any = {
        task_id,
        overall_confidence: result.confidence ?? result.metrics?.averageConfidence ?? 0,
        explanation: result.result?.reasoning || '',
        custom: result.result || {}
      };

      this.history.push({ request: call.request, response, timestamp: Date.now() });
      
      callback(null, response);
    } catch (error) {
      this.logger.error({ error }, 'Failed to coordinate');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async streamCoordinate(call: grpc.ServerWritableStream<any, any>) {
    try {
      const { task_id, description, strategy, custom_pattern, data, constraints } = call.request;
      
      this.logger.info({ taskId: task_id, strategy }, 'Stream coordinating agents via gRPC');
      
      // Map strategy to pattern
      const patternMap: Record<string, string> = {
        'CONSENSUS': 'ConsensusVoting',
        'EPISTEMIC': 'EpistemicEnsemble',
        'CASCADE': 'HierarchicalCascade',
        'QUALITY_OF_SERVICE': 'QualityOfService',
        'DEBATE': 'DebateConsensus',
        'MAP_REDUCE': 'MapReduce',
        'HIERARCHICAL': 'HierarchicalAggregation',
        'GRAPH': 'GraphConsensus',
        'RETRY': 'FaultTolerantRetry',
        'PIPELINE': 'DataPipeline',
        'AUCTION': 'MarketBasedAllocation'
      };
      
      const pattern = strategy === 'CUSTOM' && custom_pattern ? custom_pattern : (patternMap[strategy] || 'SimpleConsensus');
      const input = {
        task: description,
        data: data || {},
        strategy,
        constraints: constraints || {}
      };
      
      call.write({
        task_id,
        explanation: 'Coordination started',
        custom: { status: 'running' }
      });

      const result = await this.patternEngine.executePattern(
        pattern,
        input,
        { timeout: 30000 }
      );
      
      // Send final result
      call.write({
        task_id,
        overall_confidence: result.confidence ?? result.metrics?.averageConfidence ?? 0,
        explanation: result.result?.reasoning || '',
        custom: result.result || {}
      });
      
      call.end();
    } catch (error) {
      this.logger.error({ error }, 'Failed to stream coordinate');
      call.emit('error', {
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async getHistory(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { task_id, limit, since_timestamp } = call.request;
      const sinceMs = since_timestamp ? Number(since_timestamp) : 0;

      const entries = this.history
        .filter(entry => (!task_id || entry.request.task_id === task_id))
        .filter(entry => (sinceMs === 0 || entry.timestamp >= sinceMs))
        .slice(-Math.max(limit || 50, 1))
        .map(entry => ({
          request: entry.request,
          response: entry.response,
          timestamp: entry.timestamp
        }));

      callback(null, { entries });
    } catch (error: any) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
}
