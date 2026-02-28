'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient, type Agent } from '@/lib/api-client';
import { formatRelativeTime, getStatusColor, getConfidenceColor } from '@/lib/utils';
import { Bot, RefreshCw, Plus } from 'lucide-react';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const fetchAgents = async () => {
    try {
      const data = await apiClient.getAgents();
      setAgents(data);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusUpdate = async (agentId: string, status: Agent['status']) => {
    try {
      await apiClient.updateAgentStatus(agentId, status);
      await fetchAgents();
    } catch (error) {
      console.error('Failed to update agent status:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Agents</h1>
          <p className="text-gray-400 mt-1">Manage and monitor AI agents</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchAgents}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Register Agent
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <Card
            key={agent.id}
            className="cursor-pointer hover:border-parallax-accent/50 transition-colors"
            onClick={() => setSelectedAgent(agent)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-parallax-accent/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-parallax-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <p className="text-sm text-gray-400">{agent.id}</p>
                  </div>
                </div>
                <div className={`status-indicator ${
                  agent.status === 'active' ? 'status-healthy' :
                  agent.status === 'error' ? 'status-error' :
                  'status-warning'
                }`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Status</p>
                  <p className={`font-medium ${getStatusColor(agent.status)}`}>
                    {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-400 mb-1">Capabilities</p>
                  <div className="flex flex-wrap gap-1">
                    {agent.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="px-2 py-1 text-xs bg-white/10 rounded-md"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-400">Confidence</p>
                    <p className={`font-medium ${getConfidenceColor(agent.confidence)}`}>
                      {(agent.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">Last Seen</p>
                    <p className="text-sm">{formatRelativeTime(agent.lastSeen)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Agent Details: {selectedAgent.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Agent ID</p>
                    <p className="font-mono">{selectedAgent.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Status</p>
                    <p className={`font-medium ${getStatusColor(selectedAgent.status)}`}>
                      {selectedAgent.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Confidence Score</p>
                    <p className={`font-medium ${getConfidenceColor(selectedAgent.confidence)}`}>
                      {(selectedAgent.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Last Activity</p>
                    <p>{formatRelativeTime(selectedAgent.lastSeen)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-2">Capabilities</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedAgent.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="px-3 py-1 text-sm bg-parallax-accent/20 text-parallax-accent rounded-md"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedAgent.metadata && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Metadata</p>
                    <pre className="text-sm bg-white/5 p-4 rounded-lg overflow-auto">
                      {JSON.stringify(selectedAgent.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedAgent(null)}
                  >
                    Close
                  </Button>
                  {selectedAgent.status === 'active' ? (
                    <Button
                      variant="destructive"
                      onClick={() => handleStatusUpdate(selectedAgent.id, 'inactive')}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleStatusUpdate(selectedAgent.id, 'active')}
                    >
                      Activate
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}