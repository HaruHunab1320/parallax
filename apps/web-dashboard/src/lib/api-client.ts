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

export interface HourlyStats {
  hour: string;
  executions: number;
  successful: number;
  failed: number;
  avg_confidence: number | null;
}

export interface DailyStats {
  day: string;
  executions: number;
  successful: number;
  failed: number;
  avg_confidence: number | null;
  avg_duration_ms: number | null;
}

export interface ExecutionStats {
  total_executions: number;
  successful: number;
  failed: number;
  cancelled: number;
  in_progress: number;
  avg_duration_ms: number | null;
  avg_confidence: number | null;
}

class ApiClient {
  private controlPlane: AxiosInstance;
  private influxDB: AxiosInstance;

  constructor() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    console.log('[ApiClient] Using API URL:', apiUrl);

    this.controlPlane = axios.create({
      baseURL: apiUrl,
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
    const response = await this.controlPlane.get('/api/agents');
    return response.data.agents || [];
  }

  async getAgent(id: string): Promise<Agent> {
    const response = await this.controlPlane.get(`/api/agents/${id}`);
    return response.data;
  }

  async registerAgent(agent: Partial<Agent>): Promise<Agent> {
    const response = await this.controlPlane.post('/api/agents', agent);
    return response.data;
  }

  async updateAgentStatus(id: string, status: Agent['status']): Promise<void> {
    await this.controlPlane.patch(`/api/agents/${id}/status`, { status });
  }

  // Pattern endpoints
  async getPatterns(): Promise<Pattern[]> {
    const response = await this.controlPlane.get('/api/patterns');
    return response.data.patterns || [];
  }

  async getPattern(name: string): Promise<Pattern> {
    const response = await this.controlPlane.get(`/api/patterns/${name}`);
    return response.data;
  }

  async executePattern(name: string, input: any): Promise<PatternExecution> {
    const response = await this.controlPlane.post(`/api/patterns/${name}/execute`, input);
    return response.data;
  }

  // Execution endpoints
  async getExecutions(limit = 100): Promise<PatternExecution[]> {
    const response = await this.controlPlane.get(`/api/executions?limit=${limit}`);
    return response.data.executions || [];
  }

  async getExecution(id: string): Promise<PatternExecution> {
    const response = await this.controlPlane.get(`/api/executions/${id}`);
    return response.data;
  }

  // Metrics endpoints - computed from agents and executions since no dedicated endpoint
  async getMetrics(): Promise<Metrics> {
    try {
      const [agentsResponse, executionsResponse] = await Promise.all([
        this.controlPlane.get('/api/agents'),
        this.controlPlane.get('/api/executions'),
      ]);

      const agents = agentsResponse.data.agents || [];
      const executions = executionsResponse.data.executions || [];

      const activeAgents = agents.filter((a: Agent) => a.status === 'active').length;
      const successfulExecutions = executions.filter((e: PatternExecution) => e.status === 'completed').length;
      const avgConfidence = agents.length > 0
        ? agents.reduce((sum: number, a: Agent) => sum + (a.confidence || 0), 0) / agents.length
        : 0;

      return {
        agentCount: agents.length,
        activeAgents,
        totalExecutions: executions.length,
        successfulExecutions,
        averageConfidence: avgConfidence,
        executionsPerMinute: 0, // Would need time-series data to calculate
      };
    } catch (error) {
      console.error('[ApiClient] Failed to get metrics:', error);
      return {
        agentCount: 0,
        activeAgents: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        averageConfidence: 0,
        executionsPerMinute: 0,
      };
    }
  }

  // License endpoint
  async getLicense(): Promise<LicenseInfo> {
    try {
      const response = await this.controlPlane.get('/api/license');
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

  // Time-series stats endpoints
  async getHourlyStats(hours: number = 24): Promise<HourlyStats[]> {
    try {
      const response = await this.controlPlane.get(`/api/executions/stats/hourly?hours=${hours}`);
      return response.data.stats || [];
    } catch (error) {
      console.error('[ApiClient] Failed to get hourly stats:', error);
      return [];
    }
  }

  async getDailyStats(days: number = 7): Promise<DailyStats[]> {
    try {
      const response = await this.controlPlane.get(`/api/executions/stats/daily?days=${days}`);
      return response.data.stats || [];
    } catch (error) {
      console.error('[ApiClient] Failed to get daily stats:', error);
      return [];
    }
  }

  async getExecutionStats(): Promise<ExecutionStats> {
    try {
      const response = await this.controlPlane.get('/api/executions/stats/summary');
      return response.data;
    } catch (error) {
      console.error('[ApiClient] Failed to get execution stats:', error);
      return {
        total_executions: 0,
        successful: 0,
        failed: 0,
        cancelled: 0,
        in_progress: 0,
        avg_duration_ms: null,
        avg_confidence: null,
      };
    }
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