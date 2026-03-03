'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient, type Agent } from '@/lib/api-client';
import { formatRelativeTime, getStatusColor, getConfidenceColor } from '@/lib/utils';
import { Bot, RefreshCw, Plus, Trash2, CheckSquare, Square, MinusSquare } from 'lucide-react';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | Agent['status']>('active');
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmModalDelete, setConfirmModalDelete] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
      if (selectedAgent?.id === agentId) {
        setSelectedAgent(prev => prev ? { ...prev, status } : null);
      }
    } catch (error) {
      console.error('Failed to update agent status:', error);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    setDeletingAgentId(agentId);
    try {
      await apiClient.deleteAgent(agentId);
      if (selectedAgent?.id === agentId) {
        setSelectedAgent(null);
        setConfirmModalDelete(false);
      }
      setConfirmDeleteId(null);
      await fetchAgents();
    } catch (error) {
      console.error('Failed to delete agent:', error);
    } finally {
      setDeletingAgentId(null);
    }
  };

  const handlePurgeInactive = async () => {
    setPurging(true);
    try {
      const result = await apiClient.deleteStaleAgents(300);
      console.log(`Purged ${result.deleted} stale agents`);
      setConfirmPurge(false);
      await fetchAgents();
    } catch (error) {
      console.error('Failed to purge inactive agents:', error);
    } finally {
      setPurging(false);
    }
  };

  const filteredAgents = agents.filter(a => statusFilter === 'all' || a.status === statusFilter);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredAgents.map(a => a.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => apiClient.deleteAgent(id)));
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      await fetchAgents();
    } catch (error) {
      console.error('Failed to bulk delete agents:', error);
    } finally {
      setBulkDeleting(false);
    }
  };

  const selectionCount = selectedIds.size;
  const visibleIds = filteredAgents.map(a => a.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Agents</h1>
          <p className="text-gray-400 mt-1">Manage and monitor AI agents</p>
        </div>
        <div className="flex gap-3">
          {confirmPurge ? (
            <>
              <span className="text-sm text-gray-400 self-center">Purge inactive agents?</span>
              <Button
                variant="destructive"
                onClick={handlePurgeInactive}
                disabled={purging}
              >
                {purging ? 'Purging...' : 'Confirm'}
              </Button>
              <Button variant="outline" onClick={() => setConfirmPurge(false)} disabled={purging}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setConfirmPurge(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Purge Inactive
              </Button>
              <Button variant="outline" onClick={fetchAgents}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Register Agent
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleSelectAll}
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title={allVisibleSelected ? 'Deselect all' : 'Select all'}
        >
          {allVisibleSelected ? (
            <CheckSquare className="w-5 h-5" />
          ) : someVisibleSelected ? (
            <MinusSquare className="w-5 h-5" />
          ) : (
            <Square className="w-5 h-5" />
          )}
        </button>
        <div className="w-px h-6 bg-white/10" />
        {(['all', 'active', 'inactive', 'error'] as const).map((status) => {
          const count = status === 'all' ? agents.length : agents.filter(a => a.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                statusFilter === status
                  ? 'bg-parallax-accent text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              <span className="ml-1.5 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {selectionCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-lg">
          <span className="text-sm text-white font-medium">
            {selectionCount} agent{selectionCount !== 1 ? 's' : ''} selected
          </span>
          <div className="w-px h-5 bg-white/10" />
          {confirmBulkDelete ? (
            <>
              <span className="text-sm text-gray-400">Delete selected agents?</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? 'Deleting...' : 'Confirm'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmBulkDelete(false)}
                disabled={bulkDeleting}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmBulkDelete(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedIds(new Set());
                  setConfirmBulkDelete(false);
                }}
              >
                Clear Selection
              </Button>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAgents.map((agent) => {
          const isSelected = selectedIds.has(agent.id);
          return (
          <Card
            key={agent.id}
            className={`cursor-pointer transition-colors ${
              isSelected
                ? 'border-parallax-accent/70 bg-parallax-accent/5'
                : 'hover:border-parallax-accent/50'
            }`}
            onClick={() => {
              if (confirmDeleteId !== agent.id) {
                setSelectedAgent(agent);
              }
            }}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <button
                    className="text-gray-400 hover:text-white transition-colors shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(agent.id);
                    }}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-parallax-accent" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                  <div className="w-10 h-10 rounded-lg bg-parallax-accent/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-parallax-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <p className="text-sm text-gray-400">{agent.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {confirmDeleteId === agent.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteAgent(agent.id)}
                        disabled={deletingAgentId === agent.id}
                      >
                        {deletingAgentId === agent.id ? '...' : 'Delete'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deletingAgentId === agent.id}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-white/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(agent.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className={`status-indicator ${
                    agent.status === 'active' ? 'status-healthy' :
                    agent.status === 'error' ? 'status-error' :
                    'status-warning'
                  }`} />
                </div>
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
          );
        })}
      </div>

      {selectedAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Agent Details: {selectedAgent.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {confirmModalDelete ? (
                <div className="space-y-4 text-center py-6">
                  <p className="text-lg text-white">Are you sure you want to delete this agent?</p>
                  <p className="text-sm text-gray-400">
                    This will remove <span className="font-mono text-gray-300">{selectedAgent.name}</span> permanently.
                  </p>
                  <div className="flex justify-center gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmModalDelete(false)}
                      disabled={deletingAgentId === selectedAgent.id}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleDeleteAgent(selectedAgent.id)}
                      disabled={deletingAgentId === selectedAgent.id}
                    >
                      {deletingAgentId === selectedAgent.id ? 'Deleting...' : 'Confirm Delete'}
                    </Button>
                  </div>
                </div>
              ) : (
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

                  <div className="flex justify-between pt-4">
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmModalDelete(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Agent
                    </Button>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedAgent(null);
                          setConfirmModalDelete(false);
                        }}
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
