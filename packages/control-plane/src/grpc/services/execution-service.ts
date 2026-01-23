/**
 * gRPC Execution Service implementation
 */

import * as grpc from '@grpc/grpc-js';
import { IPatternEngine } from '../../pattern-engine/interfaces';
import { DatabaseService } from '../../db/database.service';
import { Logger } from 'pino';
import { ExecutionEventBus } from '../../execution-events';

type ExecutionRecord = {
  id: string;
  patternName: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  input?: any;
  result?: any;
  error?: string;
  confidence?: number;
  metrics?: any;
};

export class ExecutionServiceImpl {
  constructor(
    private patternEngine: IPatternEngine,
    private database: DatabaseService | undefined,
    private logger: Logger,
    private executionEvents?: ExecutionEventBus
  ) {}

  getImplementation() {
    return {
      getExecution: this.getExecution.bind(this),
      listExecutions: this.listExecutions.bind(this),
      streamExecution: this.streamExecution.bind(this)
    };
  }

  async getExecution(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { execution_id } = call.request;
      const execution = await this.fetchExecution(execution_id);

      if (!execution) {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'Execution not found'
        });
        return;
      }

      callback(null, { execution: this.toProtoExecution(execution) });
    } catch (error: any) {
      this.logger.error({ error }, 'Failed to get execution');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async listExecutions(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { limit, offset, status } = call.request || {};
      const executions = await this.fetchExecutions({
        limit,
        offset,
        status
      });

      callback(null, {
        executions: executions.map(execution => this.toProtoExecution(execution)),
        total: executions.length
      });
    } catch (error: any) {
      this.logger.error({ error }, 'Failed to list executions');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async streamExecution(call: grpc.ServerWritableStream<any, any>) {
    const { execution_id } = call.request;
    if (!execution_id) {
      call.emit('error', {
        code: grpc.status.INVALID_ARGUMENT,
        details: 'Missing execution_id'
      });
      return;
    }

    let active = true;
    let lastStatus: string | null = null;
    let unsubscribe: (() => void) | null = null;
    let sentSnapshot = false;

    const stop = () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    call.on('close', stop);
    call.on('cancelled', stop);
    call.on('error', stop);

    const poll = async () => {
      if (!active) return;

      const execution = await this.fetchExecution(execution_id);
      if (!execution) {
        call.emit('error', {
          code: grpc.status.NOT_FOUND,
          details: 'Execution not found'
        });
        stop();
        return;
      }

      if (lastStatus === null) {
        call.write({
          event_type: 'started',
          execution: this.toProtoExecution(execution),
          event_time: this.toTimestamp(new Date()),
          event_data: { source: 'snapshot' }
        });
        lastStatus = execution.status;
        return;
      }

      if (execution.status !== lastStatus) {
        const eventType = execution.status === 'completed'
          ? 'completed'
          : execution.status === 'failed'
          ? 'failed'
          : 'updated';

        call.write({
          event_type: eventType,
          execution: this.toProtoExecution(execution),
          event_time: this.toTimestamp(new Date()),
          event_data: {}
        });
        lastStatus = execution.status;
      }

      if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
        call.end();
        stop();
      }
    };

    const startPolling = async () => {
      const interval = setInterval(poll, 500);
      call.on('end', () => {
        clearInterval(interval);
        stop();
      });
      await poll();
    };

    const execution = await this.fetchExecution(execution_id);
    if (!execution) {
      call.emit('error', {
        code: grpc.status.NOT_FOUND,
        details: 'Execution not found'
      });
      stop();
      return;
    }

    call.write({
      event_type: 'started',
      execution: this.toProtoExecution(execution),
      event_time: this.toTimestamp(new Date()),
      event_data: { source: 'snapshot' }
    });
    sentSnapshot = true;
    lastStatus = execution.status;

    if (this.executionEvents) {
      unsubscribe = this.executionEvents.onExecutionId(execution_id, async (event) => {
        if (!active) return;
        if (sentSnapshot && event.type === 'started') {
          return;
        }
        const latest = await this.fetchExecution(execution_id);
        if (!latest) return;
        call.write({
          event_type: event.type,
          execution: this.toProtoExecution(latest),
          event_time: this.toTimestamp(event.timestamp),
          event_data: event.data || {}
        });

        if (['completed', 'failed', 'cancelled'].includes(event.type)) {
          call.end();
          stop();
        }
      });
      call.on('end', stop);
    } else {
      await startPolling();
    }

    if (unsubscribe) {
      call.on('end', () => {
        unsubscribe?.();
      });
    }
  }

  private async fetchExecution(executionId: string): Promise<ExecutionRecord | null> {
    if (this.executionEvents) {
      const execution = this.patternEngine.getExecution(executionId);
      if (execution) {
        return {
          id: execution.id,
          patternName: execution.patternName,
          status: execution.status,
          startTime: execution.startTime,
          endTime: execution.endTime,
          input: execution.input,
          result: execution.result,
          error: execution.error,
          confidence: execution.confidence,
          metrics: execution.metrics
        };
      }
    }

    if (this.database) {
      const record = await this.database.executions.findById(executionId);
      if (!record) return null;
      return {
        id: record.id,
        patternName: record.pattern?.name || record.patternId || '',
        status: record.status,
        startTime: record.time,
        endTime: record.durationMs ? new Date(record.time.getTime() + record.durationMs) : undefined,
        input: record.input,
        result: record.result || undefined,
        error: record.error || undefined,
        confidence: record.confidence || undefined,
        metrics: record.metrics || undefined
      };
    }

    const execution = this.patternEngine.getExecution(executionId);
    if (!execution) return null;
    return {
      id: execution.id,
      patternName: execution.patternName,
      status: execution.status,
      startTime: execution.startTime,
      endTime: execution.endTime,
      input: execution.input,
      result: execution.result,
      error: execution.error,
      confidence: execution.confidence,
      metrics: execution.metrics
    };
  }

  private async fetchExecutions(options: { limit?: number; offset?: number; status?: string }) {
    if (this.database) {
      const records = await this.database.executions.findAll({
        where: options.status ? { status: options.status } : undefined,
        orderBy: { time: 'desc' },
        skip: options.offset,
        take: options.limit
      });

      return records.map(record => ({
        id: record.id,
        patternName: (record as any).pattern?.name || record.patternId,
        status: record.status,
        startTime: record.time,
        endTime: record.durationMs ? new Date(record.time.getTime() + record.durationMs) : undefined,
        input: record.input,
        result: record.result || undefined,
        error: record.error || undefined,
        confidence: record.confidence || undefined,
        metrics: record.metrics || undefined
      }));
    }

    return this.patternEngine.listExecutions({
      limit: options.limit,
      status: options.status
    });
  }

  private toProtoExecution(execution: ExecutionRecord): any {
    return {
      id: execution.id,
      pattern_name: execution.patternName,
      status: this.toProtoStatus(execution.status),
      start_time: this.toTimestamp(execution.startTime),
      end_time: execution.endTime ? this.toTimestamp(execution.endTime) : undefined,
      input: execution.input || {},
      result: execution.result || {},
      error: execution.error || '',
      confidence: execution.confidence || 0,
      metrics: execution.metrics || {}
    };
  }

  private toProtoStatus(status: string): string {
    switch (status) {
      case 'pending':
        return 'EXECUTION_STATUS_PENDING';
      case 'running':
        return 'EXECUTION_STATUS_RUNNING';
      case 'completed':
        return 'EXECUTION_STATUS_COMPLETED';
      case 'failed':
        return 'EXECUTION_STATUS_FAILED';
      case 'cancelled':
        return 'EXECUTION_STATUS_CANCELLED';
      default:
        return 'EXECUTION_STATUS_UNKNOWN';
    }
  }

  private toTimestamp(date: Date): { seconds: number; nanos: number } {
    return {
      seconds: Math.floor(date.getTime() / 1000),
      nanos: 0
    };
  }
}
