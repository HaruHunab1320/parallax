import axios, { AxiosInstance } from 'axios';

export interface Agent {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  capabilities: string[];
  lastSeen: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface Pattern {
  name: string;
  description: string;
  enabled: boolean;
  requiredCapabilities: string[];
  executionCount: number;
  avgExecutionTime: number;
  successRate: number;
}

export interface PatternExecution {
  id: string;
  pattern: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: any;
  output?: any;
  agents: string[];
  startTime: string;
  endTime?: string;
  duration?: number;
  confidence?: number;
  error?: string;
}

export interface Metrics {
  agentCount: number;
  activeAgents: number;
  totalExecutions: number;
  successfulExecutions: number;
  averageConfidence: number;
  executionsPerMinute: number;
}

export interface LicenseInfo {
  type: 'opensource' | 'enterprise' | 'enterprise-plus';
  features: string[];
}

export interface TimeSeriesData {
  time: string;
  value: number;
}

export interface ConfidenceMetrics {
  agentId: string;
  pattern: string;
  data: TimeSeriesData[];
}

class ApiClient {
  private controlPlane: AxiosInstance;
  private influxDB: AxiosInstance;

  constructor() {
    this.controlPlane = axios.create({
      baseURL: process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || 'http://localhost:8080',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.influxDB = axios.create({
      baseURL: process.env.NEXT_PUBLIC_INFLUXDB_URL || 'http://localhost:8086',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${process.env.INFLUXDB_TOKEN}`,
      },
    });
  }

  // Agent endpoints
  async getAgents(): Promise<Agent[]> {
    const response = await this.controlPlane.get('/agents');
    return response.data;
  }

  async getAgent(id: string): Promise<Agent> {
    const response = await this.controlPlane.get(`/agents/${id}`);
    return response.data;
  }

  async registerAgent(agent: Partial<Agent>): Promise<Agent> {
    const response = await this.controlPlane.post('/agents', agent);
    return response.data;
  }

  async updateAgentStatus(id: string, status: Agent['status']): Promise<void> {
    await this.controlPlane.patch(`/agents/${id}/status`, { status });
  }

  // Pattern endpoints
  async getPatterns(): Promise<Pattern[]> {
    const response = await this.controlPlane.get('/patterns');
    return response.data;
  }

  async getPattern(name: string): Promise<Pattern> {
    const response = await this.controlPlane.get(`/patterns/${name}`);
    return response.data;
  }

  async executePattern(name: string, input: any): Promise<PatternExecution> {
    const response = await this.controlPlane.post(`/patterns/${name}/execute`, input);
    return response.data;
  }

  // Execution endpoints
  async getExecutions(limit = 100): Promise<PatternExecution[]> {
    const response = await this.controlPlane.get(`/executions?limit=${limit}`);
    return response.data;
  }

  async getExecution(id: string): Promise<PatternExecution> {
    const response = await this.controlPlane.get(`/executions/${id}`);
    return response.data;
  }

  // Metrics endpoints
  async getMetrics(): Promise<Metrics> {
    const response = await this.controlPlane.get('/metrics');
    return response.data;
  }

  // License endpoint
  async getLicense(): Promise<LicenseInfo> {
    try {
      const response = await this.controlPlane.get('/license');
      return response.data;
    } catch (error) {
      // If endpoint doesn't exist or errors, assume open source
      return { type: 'opensource', features: [] };
    }
  }

  hasEnterpriseFeature(license: LicenseInfo, feature: string): boolean {
    return license.type !== 'opensource' && license.features.includes(feature);
  }

  async getConfidenceHistory(
    agentId: string,
    pattern?: string,
    range = '1h'
  ): Promise<ConfidenceMetrics> {
    const query = `
      from(bucket: "${process.env.INFLUXDB_BUCKET || 'metrics'}")
        |> range(start: -${range})
        |> filter(fn: (r) => r["_measurement"] == "confidence")
        |> filter(fn: (r) => r["agent_id"] == "${agentId}")
        ${pattern ? `|> filter(fn: (r) => r["pattern"] == "${pattern}")` : ''}
        |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
        |> yield(name: "mean")
    `;

    const response = await this.influxDB.post('/api/v2/query', {
      query,
      type: 'flux',
    });

    // Transform InfluxDB response to our format
    const data: TimeSeriesData[] = response.data.results?.[0]?.series?.[0]?.values?.map(
      (point: any) => ({
        time: point[0],
        value: point[1],
      })
    ) || [];

    return { agentId, pattern: pattern || 'all', data };
  }

  async getPatternMetrics(pattern: string, range = '1h'): Promise<{
    executionCount: TimeSeriesData[];
    successRate: TimeSeriesData[];
    avgDuration: TimeSeriesData[];
  }> {
    // This would query pattern-specific metrics from InfluxDB
    // For now, returning mock data
    const mockData = Array.from({ length: 60 }, (_, i) => ({
      time: new Date(Date.now() - (60 - i) * 60000).toISOString(),
      value: Math.random(),
    }));

    return {
      executionCount: mockData,
      successRate: mockData.map(d => ({ ...d, value: 0.8 + Math.random() * 0.2 })),
      avgDuration: mockData.map(d => ({ ...d, value: 100 + Math.random() * 50 })),
    };
  }

  // WebSocket connection for real-time updates
  connectWebSocket(
    onMessage: (event: MessageEvent) => void,
    onError?: (error: Event) => void
  ): WebSocket {
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080');
    
    ws.onmessage = onMessage;
    ws.onerror = onError || console.error;
    ws.onopen = () => console.log('WebSocket connected');
    ws.onclose = () => console.log('WebSocket disconnected');
    
    return ws;
  }
}

export const apiClient = new ApiClient();