import { Etcd3 } from 'etcd3';
import { ServiceRegistration } from './types';
import { Logger } from 'pino';
import { EventEmitter } from 'events';

export class EtcdRegistry extends EventEmitter {
  private client: Etcd3;
  private namespace: string;
  private logger: Logger;
  private watchHandles: Map<string, any> = new Map();

  constructor(
    endpoints: string[],
    namespace: string = 'parallax',
    logger: Logger
  ) {
    super();
    this.client = new Etcd3({ hosts: endpoints });
    this.namespace = namespace;
    this.logger = logger;
  }

  async register(service: ServiceRegistration): Promise<void> {
    const key = this.getServiceKey(service.type, service.id);
    const value = JSON.stringify(service);

    try {
      if (service.ttl) {
        const lease = this.client.lease(service.ttl);
        await lease.put(key).value(value);
        
        // Auto-refresh lease
        lease.on('lost', () => {
          this.logger.warn({ service: service.id }, 'Service lease lost');
          this.emit('service:lost', service);
        });
      } else {
        await this.client.put(key).value(value);
      }

      this.logger.info({ service: service.id }, 'Service registered');
      this.emit('service:registered', service);
    } catch (error) {
      this.logger.error({ service: service.id, error }, 'Failed to register service');
      throw error;
    }
  }

  async unregister(type: string, id: string): Promise<void> {
    const key = this.getServiceKey(type, id);
    
    try {
      await this.client.delete().key(key);
      this.logger.info({ type, id }, 'Service unregistered');
      this.emit('service:unregistered', { type, id });
    } catch (error) {
      this.logger.error({ type, id, error }, 'Failed to unregister service');
      throw error;
    }
  }

  async getService(type: string, id: string): Promise<ServiceRegistration | null> {
    const key = this.getServiceKey(type, id);
    
    try {
      const response = await this.client.get(key);
      if (response) {
        return JSON.parse(response);
      }
      return null;
    } catch (error) {
      this.logger.error({ type, id, error }, 'Failed to get service');
      throw error;
    }
  }

  async listServices(type?: string): Promise<ServiceRegistration[]> {
    const prefix = type 
      ? `/${this.namespace}/services/${type}/`
      : `/${this.namespace}/services/`;

    try {
      const response = await this.client.getAll().prefix(prefix);
      
      return Object.values(response).map(value => 
        JSON.parse(value as string)
      );
    } catch (error) {
      this.logger.error({ type, error }, 'Failed to list services');
      throw error;
    }
  }

  async watchServices(
    type: string,
    callback: (event: 'added' | 'modified' | 'deleted', service: ServiceRegistration | { type: string; id: string }) => void
  ): Promise<() => void> {
    const prefix = `/${this.namespace}/services/${type}/`;
    
    const watcher = await this.client.watch()
      .prefix(prefix)
      .create();

    watcher.on('put', async (res) => {
      try {
        const service = JSON.parse(res.value.toString());
        callback('added', service);
      } catch (error) {
        this.logger.error({ error }, 'Failed to parse service on put event');
      }
    });

    watcher.on('delete', (res) => {
      const key = res.key.toString();
      const id = key.split('/').pop() || '';
      callback('deleted', { type, id });
    });

    const watchId = `${type}-${Date.now()}`;
    this.watchHandles.set(watchId, watcher);

    // Return unwatch function
    return () => {
      watcher.cancel();
      this.watchHandles.delete(watchId);
    };
  }

  private getServiceKey(type: string, id: string): string {
    return `/${this.namespace}/services/${type}/${id}`;
  }

  async updateHealth(type: string, id: string, status: 'healthy' | 'unhealthy'): Promise<void> {
    const service = await this.getService(type, id);
    if (service) {
      service.health.status = status;
      service.health.lastCheck = new Date();
      await this.register(service);
    }
  }

  async close(): Promise<void> {
    // Cancel all watches
    for (const watcher of this.watchHandles.values()) {
      watcher.cancel();
    }
    this.watchHandles.clear();
    
    // Close etcd client
    this.client.close();
  }
}