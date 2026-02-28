'use client';

import React, { useEffect, useState } from 'react';
import { MetricCard } from '@/components/dashboard/metric-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Zap, TrendingUp, Activity } from 'lucide-react';
import { apiClient, type Metrics, type Agent, type PatternExecution, type HourlyStats, type DailyStats } from '@/lib/api-client';
import { formatRelativeTime, getStatusColor, formatDuration } from '@/lib/utils';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<PatternExecution[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricsData, agentsData, executionsData, hourlyData, dailyData] = await Promise.all([
          apiClient.getMetrics(),
          apiClient.getAgents(),
          apiClient.getExecutions(10),
          apiClient.getHourlyStats(24),
          apiClient.getDailyStats(7),
        ]);

        setMetrics(metricsData);
        setAgents(agentsData);
        setRecentExecutions(executionsData);
        setHourlyStats(hourlyData);
        setDailyStats(dailyData);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Transform hourly stats for confidence chart
  const confidenceData = hourlyStats.map((stat) => ({
    time: new Date(stat.hour).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    confidence: stat.avg_confidence ?? 0,
  }));

  // Transform daily stats for executions chart
  const executionData = dailyStats.map((stat) => ({
    day: new Date(stat.day).toLocaleDateString('en-US', { weekday: 'short' }),
    executions: Number(stat.executions) || 0,
    successful: Number(stat.successful) || 0,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Overview of your AI orchestration platform</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Active Agents"
          value={metrics?.activeAgents || 0}
          subtitle={`${metrics?.agentCount || 0} total`}
          trend={{ value: 12, direction: 'up' }}
          icon={<Bot className="w-6 h-6" />}
        />
        <MetricCard
          title="Pattern Executions"
          value={metrics?.totalExecutions || 0}
          subtitle="Last 24 hours"
          trend={{ value: 8, direction: 'up' }}
          icon={<Zap className="w-6 h-6" />}
        />
        <MetricCard
          title="Success Rate"
          value={`${((metrics?.successfulExecutions || 0) / (metrics?.totalExecutions || 1) * 100).toFixed(1)}%`}
          subtitle="Pattern execution"
          trend={{ value: 3, direction: 'up' }}
          icon={<TrendingUp className="w-6 h-6" />}
        />
        <MetricCard
          title="Avg Confidence"
          value={(metrics?.averageConfidence || 0).toFixed(2)}
          subtitle="Across all agents"
          trend={{ value: 5, direction: 'stable' }}
          icon={<Activity className="w-6 h-6" />}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Confidence Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={confidenceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#666" />
                <YAxis stroke="#666" domain={[0, 1]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #333',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="confidence"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Executions</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={executionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="day" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #333',
                  }}
                />
                <Bar dataKey="executions" fill="#3B82F6" />
                <Bar dataKey="successful" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Active Agents and Recent Executions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Active Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agents.slice(0, 5).map((agent) => (
                <div key={agent.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{agent.name}</p>
                    <p className="text-sm text-gray-400">
                      {agent.capabilities.join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${getStatusColor(agent.status)}`}>
                      {agent.status}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatRelativeTime(agent.lastSeen)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Executions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentExecutions.slice(0, 5).map((execution) => (
                <div key={execution.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{execution.pattern}</p>
                    <p className="text-sm text-gray-400">
                      {execution.agents.length} agents
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${getStatusColor(execution.status)}`}>
                      {execution.status}
                    </p>
                    {execution.duration && (
                      <p className="text-xs text-gray-500">
                        {formatDuration(execution.duration)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}