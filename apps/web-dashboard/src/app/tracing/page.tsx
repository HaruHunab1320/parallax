'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, RefreshCw, Search, ChevronRight, Clock, CheckCircle, XCircle } from 'lucide-react';

interface ExecutionTrace {
  id: string;
  pattern: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  duration?: number;
  confidence?: number;
  agents?: string[];
  input?: any;
  output?: any;
  error?: string;
}

export default function TracingPage() {
  const [traces, setTraces] = useState<ExecutionTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState<ExecutionTrace | null>(null);
  const [searchId, setSearchId] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchTraces = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/executions`);
      const data = await response.json();
      setTraces(data.executions || []);
    } catch (error) {
      console.error('Failed to fetch traces:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchTrace = async () => {
    if (!searchId.trim()) return;
    try {
      const response = await fetch(`${apiUrl}/api/executions/${searchId}`);
      if (response.ok) {
        const trace = await response.json();
        setSelectedTrace(trace);
      } else {
        alert('Execution not found');
      }
    } catch (error) {
      console.error('Failed to search trace:', error);
    }
  };

  useEffect(() => {
    fetchTraces();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Execution Traces</h1>
          <p className="text-gray-400 mt-1">View detailed execution traces and debugging info</p>
        </div>
        <Button variant="outline" onClick={fetchTraces} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-parallax-accent" />
            Find Execution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchTrace()}
              placeholder="Enter execution ID..."
              className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-parallax-accent font-mono"
            />
            <Button onClick={searchTrace}>
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Trace List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Executions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-gray-400">Loading traces...</div>
            ) : traces.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No executions found</div>
            ) : (
              <div className="divide-y divide-white/10 max-h-[500px] overflow-y-auto">
                {traces.map((trace) => (
                  <div
                    key={trace.id}
                    onClick={() => setSelectedTrace(trace)}
                    className={`p-4 cursor-pointer hover:bg-white/5 transition-colors flex items-center justify-between ${
                      selectedTrace?.id === trace.id ? 'bg-white/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(trace.status)}
                      <div>
                        <p className="text-white font-medium">{trace.pattern}</p>
                        <p className="text-xs text-gray-500 font-mono">{trace.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {trace.duration && (
                        <span className="text-sm text-gray-400">{trace.duration}ms</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trace Details */}
        <Card>
          <CardHeader>
            <CardTitle>Trace Details</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTrace ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(selectedTrace.status)}
                  <div>
                    <p className="text-xl font-bold text-white">{selectedTrace.pattern}</p>
                    <p className="text-sm text-gray-400 font-mono">{selectedTrace.id}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Status</p>
                    <p className="text-white capitalize">{selectedTrace.status}</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Duration</p>
                    <p className="text-white">{selectedTrace.duration ?? '-'}ms</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Start Time</p>
                    <p className="text-white text-sm">{formatTime(selectedTrace.startTime)}</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Confidence</p>
                    <p className="text-white">
                      {selectedTrace.confidence ? `${(selectedTrace.confidence * 100).toFixed(1)}%` : '-'}
                    </p>
                  </div>
                </div>

                {selectedTrace.agents && selectedTrace.agents.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Agents Involved</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTrace.agents.map((agent) => (
                        <span
                          key={agent}
                          className="px-2 py-1 bg-parallax-accent/20 text-parallax-accent rounded text-sm"
                        >
                          {agent}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTrace.input && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Input</p>
                    <pre className="bg-white/5 p-3 rounded-lg text-xs text-gray-300 overflow-x-auto">
                      {JSON.stringify(selectedTrace.input, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedTrace.output && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Output</p>
                    <pre className="bg-white/5 p-3 rounded-lg text-xs text-gray-300 overflow-x-auto">
                      {JSON.stringify(selectedTrace.output, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedTrace.error && (
                  <div>
                    <p className="text-sm text-red-400 mb-2">Error</p>
                    <pre className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-xs text-red-300 overflow-x-auto">
                      {selectedTrace.error}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select an execution to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
