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
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

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

export default function SettingsPage() {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchSettings();
  }, []);

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
    </div>
  );
}
