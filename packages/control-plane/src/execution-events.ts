import { EventEmitter } from 'events';

export type ExecutionEvent = {
  executionId: string;
  type: string;
  data?: any;
  timestamp: Date;
};

export class ExecutionEventBus extends EventEmitter {
  emitEvent(event: ExecutionEvent): void {
    this.emit('execution', event);
  }

  onExecution(handler: (event: ExecutionEvent) => void): () => void {
    this.on('execution', handler);
    return () => this.off('execution', handler);
  }

  onExecutionId(executionId: string, handler: (event: ExecutionEvent) => void): () => void {
    const wrapped = (event: ExecutionEvent) => {
      if (event.executionId === executionId) {
        handler(event);
      }
    };
    this.on('execution', wrapped);
    return () => this.off('execution', wrapped);
  }
}
