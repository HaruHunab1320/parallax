'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Settings,
  Database,
  Shield,
  Server,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Key,
  Plus,
  Copy,
  Trash2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth/auth-provider';

interface LicenseInfo {
  type: 'opensource' | 'enterprise' | 'enterprise-plus';
  features: string[];
  expiresAt?: string;
}

interface SystemHealth {
  patternEngine: 'up' | 'down' | 'unknown';
  runtime: 'up' | 'down' | 'unknown';
  registry: 'up' | 'down' | 'unknown';
}

interface ClusterInfo {
  nodeCount: number;
  healthyNodeCount: number;
  leaderId?: string;
  isLeader: boolean;
}

interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: any;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('90');
  const [creatingKey, setCreatingKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchSettings = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    try {
      setLoading(true);

      // Fetch license info
      try {
        const license = await apiClient.getLicense();
        setLicenseInfo(license);
      } catch (e) {
        setLicenseInfo({ type: 'opensource', features: [] });
      }

      // Fetch health info
      try {
        const healthResponse = await fetch(`${apiUrl}/health`);
        const health = await healthResponse.json();
        setSystemHealth({
          patternEngine: health.services?.patternEngine?.status || 'unknown',
          runtime: health.services?.runtime?.status || 'unknown',
          registry: health.services?.registry?.status || 'unknown',
        });
      } catch (e) {
        setSystemHealth({
          patternEngine: 'unknown',
          runtime: 'unknown',
          registry: 'unknown',
        });
      }

      // Fetch cluster info (if available)
      try {
        const clusterResponse = await fetch(`${apiUrl}/health/cluster`);
        const cluster = await clusterResponse.json();
        setClusterInfo(cluster);
      } catch (e) {
        setClusterInfo(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    if (!user?.id) return;
    try {
      setApiKeysLoading(true);
      const data = await apiClient.get(`/api/users/${user.id}/api-keys`);
      setApiKeys(data.apiKeys || []);
    } catch (e) {
      console.error('Failed to fetch API keys:', e);
    } finally {
      setApiKeysLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!user?.id || !newKeyName.trim()) return;
    try {
      setCreatingKey(true);
      let expiresAt: string | undefined;
      if (newKeyExpiry !== 'never') {
        const days = parseInt(newKeyExpiry);
        const date = new Date();
        date.setDate(date.getDate() + days);
        expiresAt = date.toISOString();
      }
      const data = await apiClient.post(`/api/users/${user.id}/api-keys`, {
        name: newKeyName.trim(),
        expiresAt,
      });
      setCreatedKey(data.key);
      fetchApiKeys();
    } catch (e) {
      console.error('Failed to create API key:', e);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string, keyName: string) => {
    if (!user?.id) return;
    if (!confirm(`Revoke API key "${keyName}"? This action cannot be undone.`)) return;
    try {
      setRevokingKeyId(keyId);
      await apiClient.del(`/api/users/${user.id}/api-keys/${keyId}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (e) {
      console.error('Failed to revoke API key:', e);
    } finally {
      setRevokingKeyId(null);
    }
  };

  const handleCopyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeCreateModal = () => {
    setShowCreateKeyModal(false);
    setNewKeyName('');
    setNewKeyExpiry('90');
    setCreatedKey(null);
    setCopied(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    fetchApiKeys();
  }, [user?.id]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getLicenseColor = (type: string) => {
    switch (type) {
      case 'enterprise-plus':
        return 'text-purple-400';
      case 'enterprise':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 mt-1">System configuration and status</p>
        </div>
        <Button variant="outline" onClick={fetchSettings}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading settings...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* License Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-parallax-accent" />
                License
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-400">Edition</p>
                  <p className={`text-xl font-bold capitalize ${getLicenseColor(licenseInfo?.type || 'opensource')}`}>
                    {licenseInfo?.type?.replace('-', ' ') || 'Open Source'}
                  </p>
                </div>

                {licenseInfo?.expiresAt && (
                  <div>
                    <p className="text-sm text-gray-400">Expires</p>
                    <p className="text-white">
                      {new Date(licenseInfo.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-400 mb-2">Features</p>
                  <div className="flex flex-wrap gap-2">
                    {(licenseInfo?.features || ['unlimited_agents', 'all_patterns', 'cli_full']).map((feature) => (
                      <span
                        key={feature}
                        className="px-2 py-1 text-xs bg-white/10 rounded-md text-gray-300"
                      >
                        {feature.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                {licenseInfo?.type === 'opensource' && (
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-sm text-gray-400 mb-2">
                      Upgrade to Enterprise for production features
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://parallax.ai/enterprise" target="_blank" rel="noopener noreferrer">
                        Learn More
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* System Health */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-parallax-accent" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-gray-300">Pattern Engine</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(systemHealth?.patternEngine === 'up' ? 'healthy' : systemHealth?.patternEngine || 'unknown')}
                    <span className="capitalize">{systemHealth?.patternEngine || 'Unknown'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-gray-300">Runtime</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(systemHealth?.runtime === 'up' ? 'healthy' : systemHealth?.runtime || 'unknown')}
                    <span className="capitalize">{systemHealth?.runtime || 'Unknown'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-300">Registry (etcd)</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(systemHealth?.registry === 'up' ? 'healthy' : systemHealth?.registry || 'unknown')}
                    <span className="capitalize">{systemHealth?.registry || 'Unknown'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cluster Info */}
          {clusterInfo && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-parallax-accent" />
                  Cluster
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-lg">
                      <p className="text-sm text-gray-400">Total Nodes</p>
                      <p className="text-2xl font-bold text-white">{clusterInfo.nodeCount}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-lg">
                      <p className="text-sm text-gray-400">Healthy Nodes</p>
                      <p className="text-2xl font-bold text-green-500">{clusterInfo.healthyNodeCount}</p>
                    </div>
                  </div>

                  {clusterInfo.leaderId && (
                    <div>
                      <p className="text-sm text-gray-400">Leader Node</p>
                      <p className="text-white font-mono">{clusterInfo.leaderId}</p>
                      {clusterInfo.isLeader && (
                        <span className="text-xs text-green-500">(This node)</span>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-parallax-accent" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-gray-300">API URL</span>
                  <span className="text-white font-mono text-sm">
                    {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-gray-300">Environment</span>
                  <span className="text-white">
                    {process.env.NODE_ENV || 'development'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-300">Version</span>
                  <span className="text-white">
                    {process.env.NEXT_PUBLIC_VERSION || '0.1.0'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* API Keys Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-parallax-accent" />
              API Keys
            </CardTitle>
            <Button size="sm" onClick={() => setShowCreateKeyModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create API Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeysLoading ? (
            <div className="text-center py-8 text-gray-400">Loading API keys...</div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No API keys yet</p>
              <p className="text-gray-500 text-sm mt-1">
                Create an API key to authenticate with the Parallax API
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-400 border-b border-white/10">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Key</th>
                    <th className="pb-3 font-medium">Created</th>
                    <th className="pb-3 font-medium">Last Used</th>
                    <th className="pb-3 font-medium">Expires</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="text-sm">
                      <td className="py-3 text-white font-medium">{key.name}</td>
                      <td className="py-3">
                        <code className="text-gray-400 bg-white/5 px-2 py-1 rounded text-xs">
                          {key.keyPrefix}...
                        </code>
                      </td>
                      <td className="py-3 text-gray-400">
                        {new Date(key.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-gray-400">
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="py-3 text-gray-400">
                        {key.expiresAt
                          ? new Date(key.expiresAt).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeKey(key.id, key.name)}
                          disabled={revokingKeyId === key.id}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create API Key Modal */}
      {showCreateKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{createdKey ? 'API Key Created' : 'Create API Key'}</CardTitle>
            </CardHeader>
            <CardContent>
              {createdKey ? (
                <div className="space-y-4">
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-yellow-400 text-sm font-medium">
                      Copy this key now. It will not be shown again.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white font-mono break-all">
                      {createdKey}
                    </code>
                    <Button variant="outline" size="icon" onClick={handleCopyKey}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  {copied && (
                    <p className="text-green-400 text-sm">Copied to clipboard</p>
                  )}
                  <div className="flex justify-end pt-2">
                    <Button onClick={closeCreateModal}>Done</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. CI/CD Pipeline"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-parallax-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Expires</label>
                    <select
                      value={newKeyExpiry}
                      onChange={(e) => setNewKeyExpiry(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-parallax-accent"
                    >
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="365">1 year</option>
                      <option value="never">Never</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={closeCreateModal}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateKey}
                      disabled={!newKeyName.trim() || creatingKey}
                    >
                      {creatingKey ? 'Creating...' : 'Create Key'}
                    </Button>
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
