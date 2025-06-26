import { RuntimeConfig, RuntimeInstance } from './types';
import { EventEmitter } from 'events';

export class PrismRuntimePool extends EventEmitter {
  private instances: Map<string, RuntimeInstance> = new Map();
  private config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    super();
    this.config = config;
    this.initializePool();
  }

  private initializePool(): void {
    // Pre-warm instances
    for (let i = 0; i < this.config.warmupInstances; i++) {
      this.createInstance();
    }
  }

  private createInstance(): RuntimeInstance {
    const instance: RuntimeInstance = {
      id: this.generateInstanceId(),
      status: 'idle',
      createdAt: new Date(),
      executionCount: 0,
    };

    this.instances.set(instance.id, instance);
    this.emit('instance:created', instance);
    
    return instance;
  }

  async acquireInstance(): Promise<RuntimeInstance> {
    // Find idle instance
    const idleInstance = Array.from(this.instances.values())
      .find(inst => inst.status === 'idle');

    if (idleInstance) {
      idleInstance.status = 'busy';
      idleInstance.lastUsedAt = new Date();
      return idleInstance;
    }

    // Create new instance if under limit
    if (this.instances.size < this.config.maxInstances) {
      const newInstance = this.createInstance();
      newInstance.status = 'busy';
      newInstance.lastUsedAt = new Date();
      return newInstance;
    }

    // Wait for available instance
    return this.waitForAvailableInstance();
  }

  releaseInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = 'idle';
      instance.executionCount++;
      this.emit('instance:released', instance);
    }
  }

  private async waitForAvailableInstance(): Promise<RuntimeInstance> {
    return new Promise((resolve) => {
      const checkAvailable = () => {
        const available = Array.from(this.instances.values())
          .find(inst => inst.status === 'idle');
        
        if (available) {
          available.status = 'busy';
          available.lastUsedAt = new Date();
          resolve(available);
        } else {
          setTimeout(checkAvailable, 100);
        }
      };
      
      checkAvailable();
    });
  }

  private generateInstanceId(): string {
    return `prism-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  getMetrics() {
    const instances = Array.from(this.instances.values());
    
    return {
      activeInstances: instances.filter(i => i.status === 'busy').length,
      idleInstances: instances.filter(i => i.status === 'idle').length,
      totalInstances: instances.length,
      errorInstances: instances.filter(i => i.status === 'error').length,
    };
  }

  async shutdown(): Promise<void> {
    // Clean up all instances
    this.instances.clear();
    this.emit('pool:shutdown');
  }
}