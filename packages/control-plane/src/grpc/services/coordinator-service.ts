/**
 * gRPC Coordinator Service implementation
 */

import * as grpc from '@grpc/grpc-js';
import { IPatternEngine } from '../../pattern-engine/interfaces';
import type { IAgentRegistry } from '../../registry';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';

export class CoordinatorServiceImpl {
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
      const { task, strategy, agents, parameters } = call.request;
      
      this.logger.info({ task, strategy }, 'Coordinating agents via gRPC');
      
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
      
      const pattern = patternMap[strategy] || 'SimpleConsensus';
      
      // Create coordination request
      const coordinationId = uuidv4();
      const input = {
        task: task.description,
        data: task.data ? JSON.parse(task.data) : {},
        strategy,
        agents: agents || [],
        ...parameters
      };
      
      // Execute coordination pattern
      const result = await this.patternEngine.executePattern(
        pattern,
        input,
        { timeout: 30000 }
      );
      
      // Convert to proto response
      const response: any = {
        coordination_id: coordinationId,
        task,
        strategy,
        status: result.error ? 'FAILED' : 'COMPLETED',
        results: [],
        final_result: null,
        metadata: {},
        created_at: {
          seconds: Math.floor(Date.now() / 1000),
          nanos: 0
        },
        completed_at: {
          seconds: Math.floor(Date.now() / 1000),
          nanos: 0
        }
      };
      
      // Add results if available
      if (result.result) {
        // If result has individual agent results
        if (Array.isArray(result.result.results)) {
          response.results = result.result.results.map((r: any) => ({
            value_json: JSON.stringify(r.value || {}),
            confidence: r.confidence || 0,
            agent_id: r.agentId || '',
            timestamp: {
              seconds: Math.floor(Date.now() / 1000),
              nanos: 0
            },
            reasoning: r.reasoning || '',
            metadata: r.metadata || {}
          }));
        }
        
        // Set final aggregated result
        response.final_result = {
          value_json: JSON.stringify(result.result),
          confidence: result.confidence || 0,
          agent_id: 'coordinator',
          timestamp: {
            seconds: Math.floor(Date.now() / 1000),
            nanos: 0
          },
          reasoning: result.result.reasoning || '',
          metadata: result.result.metadata || {}
        };
      }
      
      if (result.error) {
        response.error = result.error;
      }
      
      callback(null, { response });
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
      const { task, strategy, agents, parameters } = call.request;
      
      this.logger.info({ task, strategy }, 'Stream coordinating agents via gRPC');
      
      const coordinationId = uuidv4();
      
      // Send initial status
      call.write({
        response: {
          coordination_id: coordinationId,
          task,
          strategy,
          status: 'RUNNING',
          created_at: {
            seconds: Math.floor(Date.now() / 1000),
            nanos: 0
          }
        }
      });
      
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
      
      const pattern = patternMap[strategy] || 'SimpleConsensus';
      const input = {
        task: task.description,
        data: task.data ? JSON.parse(task.data) : {},
        strategy,
        agents: agents || [],
        ...parameters
      };
      
      // Execute coordination (TODO: Add streaming support)
      const result = await this.patternEngine.executePattern(
        pattern,
        input,
        { timeout: 30000 }
      );
      
      // Send individual agent results if available
      if (result.result && Array.isArray(result.result.results)) {
        for (const agentResult of result.result.results) {
          call.write({
            response: {
              coordination_id: coordinationId,
              status: 'RUNNING',
              results: [{
                value_json: JSON.stringify(agentResult.value || {}),
                confidence: agentResult.confidence || 0,
                agent_id: agentResult.agentId || '',
                timestamp: {
                  seconds: Math.floor(Date.now() / 1000),
                  nanos: 0
                },
                reasoning: agentResult.reasoning || '',
                metadata: agentResult.metadata || {}
              }]
            }
          });
        }
      }
      
      // Send final result
      call.write({
        response: {
          coordination_id: coordinationId,
          task,
          strategy,
          status: result.status === 'failed' ? 'FAILED' : 'COMPLETED',
          final_result: {
            value_json: JSON.stringify(result.result || {}),
            confidence: result.confidence || 0,
            agent_id: 'coordinator',
            timestamp: {
              seconds: Math.floor(Date.now() / 1000),
              nanos: 0
            },
            reasoning: result.result?.reasoning || '',
            metadata: result.result?.metadata || {}
          },
          completed_at: {
            seconds: Math.floor(Date.now() / 1000),
            nanos: 0
          },
          error: result.error
        }
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
    // For now, return UNIMPLEMENTED
    // TODO: Implement coordination history
    callback({
      code: grpc.status.UNIMPLEMENTED,
      details: 'Coordination history not yet implemented'
    });
  }
}