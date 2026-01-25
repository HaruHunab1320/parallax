'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import {
  Zap,
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Loader,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface Execution {
  id: string;
  patternId?: string;
  patternName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: any;
  result?: any;
  error?: string;
  confidence?: number;
  durationMs?: number;
  agentCount?: number;
  createdAt: string;
  time?: string;
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);

  const fetchExecutions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/executions?limit=100');
      const data = await response.json();
      setExecutions(data.executions || data || []);
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
    // Refresh every 5 seconds for live updates
    const interval = setInterval(fetchExecutions, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredExecutions = executions.filter((e) => {
    const matchesSearch =
      (e.patternName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      case 'running':
        return 'text-blue-500';
      case 'pending':
        return 'text-yellow-500';
      default:
        return 'text-gray-500';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  const statusCounts = {
    all: executions.length,
    completed: executions.filter((e) => e.status === 'completed').length,
    running: executions.filter((e) => e.status === 'running').length,
    failed: executions.filter((e) => e.status === 'failed').length,
    pending: executions.filter((e) => e.status === 'pending').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Executions</h1>
          <p className="text-gray-400 mt-1">Monitor pattern execution history</p>
        </div>
        <Button variant="outline" onClick={fetchExecutions}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(statusCounts).map(([status, count]) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`p-4 rounded-lg border transition-colors ${
              statusFilter === status
                ? 'border-parallax-accent bg-parallax-accent/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <p className="text-2xl font-bold text-white">{count}</p>
            <p className="text-sm text-gray-400 capitalize">{status}</p>
          </button>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by pattern or execution ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-parallax-accent"
          />
        </div>
      </div>

      {/* Executions List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading executions...</div>
      ) : filteredExecutions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {searchQuery || statusFilter !== 'all'
            ? 'No executions match your filters'
            : 'No executions yet'}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-white/10">
              {filteredExecutions.map((execution) => (
                <div
                  key={execution.id}
                  className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => setSelectedExecution(execution)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-parallax-accent/20 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-parallax-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {execution.patternName || 'Unknown Pattern'}
                      </p>
                      <p className="text-sm text-gray-400 font-mono">
                        {execution.id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right hidden md:block">
                      <p className="text-sm text-gray-400">Duration</p>
                      <p className="text-white">
                        {execution.durationMs
                          ? `${(execution.durationMs / 1000).toFixed(2)}s`
                          : '-'}
                      </p>
                    </div>

                    {execution.confidence !== undefined && (
                      <div className="text-right hidden md:block">
                        <p className="text-sm text-gray-400">Confidence</p>
                        <p className={getConfidenceColor(execution.confidence)}>
                          {(execution.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}

                    <div className="text-right hidden sm:block">
                      <p className="text-sm text-gray-400">Time</p>
                      <p className="text-white text-sm">
                        {formatRelativeTime(execution.createdAt || execution.time || '')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusIcon(execution.status)}
                      <span className={`capitalize ${getStatusColor(execution.status)}`}>
                        {execution.status}
                      </span>
                    </div>

                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Execution Details Modal */}
      {selectedExecution && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-3xl max-h-[80vh] overflow-auto">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {getStatusIcon(selectedExecution.status)}
                    {selectedExecution.patternName || 'Execution Details'}
                  </CardTitle>
                  <p className="text-sm text-gray-400 mt-1 font-mono">
                    {selectedExecution.id}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedExecution(null)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Status and Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Status</p>
                    <p className={`font-medium capitalize ${getStatusColor(selectedExecution.status)}`}>
                      {selectedExecution.status}
                    </p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Duration</p>
                    <p className="font-medium text-white">
                      {selectedExecution.durationMs
                        ? `${(selectedExecution.durationMs / 1000).toFixed(2)}s`
                        : 'N/A'}
                    </p>
                  </div>
                  {selectedExecution.confidence !== undefined && (
                    <div className="bg-white/5 p-4 rounded-lg">
                      <p className="text-sm text-gray-400">Confidence</p>
                      <p className={`font-medium ${getConfidenceColor(selectedExecution.confidence)}`}>
                        {(selectedExecution.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                  )}
                  {selectedExecution.agentCount !== undefined && (
                    <div className="bg-white/5 p-4 rounded-lg">
                      <p className="text-sm text-gray-400">Agents</p>
                      <p className="font-medium text-white">{selectedExecution.agentCount}</p>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Input</h3>
                  <pre className="text-sm bg-white/5 p-4 rounded-lg overflow-auto max-h-40">
                    {JSON.stringify(selectedExecution.input, null, 2)}
                  </pre>
                </div>

                {/* Result or Error */}
                {selectedExecution.result && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Result</h3>
                    <pre className="text-sm bg-white/5 p-4 rounded-lg overflow-auto max-h-60">
                      {JSON.stringify(selectedExecution.result, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedExecution.error && (
                  <div>
                    <h3 className="text-sm font-medium text-red-400 mb-2">Error</h3>
                    <pre className="text-sm bg-red-500/10 text-red-400 p-4 rounded-lg overflow-auto">
                      {selectedExecution.error}
                    </pre>
                  </div>
                )}

                {/* Timestamp */}
                <div className="text-sm text-gray-400">
                  Started:{' '}
                  {new Date(selectedExecution.createdAt || selectedExecution.time || '').toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
