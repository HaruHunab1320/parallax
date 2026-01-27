'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, RefreshCw, Activity, CheckCircle, XCircle, Clock } from 'lucide-react';

interface MetricsData {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  activeAgents: number;
  totalAgents: number;
  avgExecutionTime: number;
  recentExecutions: Array<{
    id: string;
    pattern: string;
    status: string;
    duration?: number;
    createdAt: string;
  }>;
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch executions
      const execResponse = await fetch(`${apiUrl}/api/executions`);
      const execData = await execResponse.json();
      const executions = execData.executions || [];

      // Fetch agents
      const agentsResponse = await fetch(`${apiUrl}/api/agents`);
      const agentsData = await agentsResponse.json();
      const agents = agentsData.agents || [];

      // Calculate metrics
      const successful = executions.filter((e: any) => e.status === 'completed').length;
      const failed = executions.filter((e: any) => e.status === 'failed').length;
      const activeAgents = agents.filter((a: any) => a.status === 'active').length;

      // Calculate average execution time
      const completedWithDuration = executions.filter((e: any) => e.duration != null);
      const avgTime = completedWithDuration.length > 0
        ? completedWithDuration.reduce((sum: number, e: any) => sum + e.duration, 0) / completedWithDuration.length
        : 0;

      setMetrics({
        totalExecutions: executions.length,
        successfulExecutions: successful,
        failedExecutions: failed,
        activeAgents,
        totalAgents: agents.length,
        avgExecutionTime: Math.round(avgTime),
        recentExecutions: executions.slice(0, 10),
      });
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
      setError('Failed to load metrics. Is the control plane running?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  const successRate = metrics && metrics.totalExecutions > 0
    ? ((metrics.successfulExecutions / metrics.totalExecutions) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Metrics</h1>
          <p className="text-gray-400 mt-1">System performance and execution statistics</p>
        </div>
        <Button variant="outline" onClick={fetchMetrics} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Main Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Executions</p>
                <p className="text-3xl font-bold text-white">
                  {metrics?.totalExecutions ?? '-'}
                </p>
              </div>
              <Activity className="w-8 h-8 text-parallax-accent opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Success Rate</p>
                <p className="text-3xl font-bold text-green-500">{successRate}%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Active Agents</p>
                <p className="text-3xl font-bold text-white">
                  {metrics ? `${metrics.activeAgents}/${metrics.totalAgents}` : '-'}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-parallax-accent opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Avg Execution Time</p>
                <p className="text-3xl font-bold text-white">
                  {metrics?.avgExecutionTime ?? '-'}ms
                </p>
              </div>
              <Clock className="w-8 h-8 text-parallax-accent opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Execution Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Execution Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-gray-300">Successful</span>
                </div>
                <span className="text-white font-bold">{metrics?.successfulExecutions ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="text-gray-300">Failed</span>
                </div>
                <span className="text-white font-bold">{metrics?.failedExecutions ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-500" />
                  <span className="text-gray-300">Pending/Running</span>
                </div>
                <span className="text-white font-bold">
                  {metrics ? metrics.totalExecutions - metrics.successfulExecutions - metrics.failedExecutions : 0}
                </span>
              </div>

              {/* Progress bar */}
              {metrics && metrics.totalExecutions > 0 && (
                <div className="mt-4">
                  <div className="h-3 bg-white/10 rounded-full overflow-hidden flex">
                    <div
                      className="bg-green-500 h-full"
                      style={{ width: `${(metrics.successfulExecutions / metrics.totalExecutions) * 100}%` }}
                    />
                    <div
                      className="bg-red-500 h-full"
                      style={{ width: `${(metrics.failedExecutions / metrics.totalExecutions) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Executions</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.recentExecutions && metrics.recentExecutions.length > 0 ? (
              <div className="space-y-2">
                {metrics.recentExecutions.slice(0, 5).map((exec) => (
                  <div
                    key={exec.id}
                    className="flex items-center justify-between py-2 border-b border-white/10 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      {exec.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : exec.status === 'failed' ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <Clock className="w-4 h-4 text-yellow-500" />
                      )}
                      <span className="text-gray-300 text-sm font-mono">{exec.pattern}</span>
                    </div>
                    <span className="text-gray-500 text-xs">
                      {exec.duration ? `${exec.duration}ms` : '-'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No executions yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
