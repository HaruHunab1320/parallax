export interface ServiceRegistration {
  id: string;
  name: string;
  type: 'agent' | 'pattern' | 'monitor';
  endpoint: string;
  metadata: {
    capabilities?: string[];
    version?: string;
    region?: string;
    [key: string]: any;
  };
  health: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    lastCheck: Date;
    checkInterval: number;
  };
  registeredAt: Date;
  ttl?: number;
}