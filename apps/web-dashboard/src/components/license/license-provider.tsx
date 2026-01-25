'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient, LicenseInfo } from '@/lib/api-client';
import { UpgradePrompt } from './upgrade-prompt';

interface LicenseContextType {
  license: LicenseInfo | null;
  isLoading: boolean;
  isEnterprise: boolean;
  hasFeature: (feature: string) => boolean;
}

const LicenseContext = createContext<LicenseContextType>({
  license: null,
  isLoading: true,
  isEnterprise: false,
  hasFeature: () => false,
});

export function useLicense() {
  return useContext(LicenseContext);
}

interface LicenseProviderProps {
  children: React.ReactNode;
  requireEnterprise?: boolean;
  requiredFeature?: string;
}

export function LicenseProvider({
  children,
  requireEnterprise = true,
  requiredFeature = 'web_dashboard',
}: LicenseProviderProps) {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkLicense() {
      try {
        const licenseInfo = await apiClient.getLicense();
        setLicense(licenseInfo);
      } catch (err) {
        console.error('Failed to check license:', err);
        // Assume open source if we can't reach the control plane
        setLicense({ type: 'opensource', features: [] });
        setError('Unable to connect to control plane');
      } finally {
        setIsLoading(false);
      }
    }

    checkLicense();
  }, []);

  const isEnterprise = license?.type === 'enterprise' || license?.type === 'enterprise-plus';

  const hasFeature = (feature: string): boolean => {
    if (!license) return false;
    return license.features.includes(feature);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-parallax-dark">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-parallax-gray">Checking license...</p>
        </div>
      </div>
    );
  }

  // Show connection error but still check license type
  if (error && !license) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-parallax-dark">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-white mb-2">Connection Error</h2>
          <p className="text-parallax-gray mb-4">
            Unable to connect to the Parallax control plane at{' '}
            <code className="bg-parallax-card px-2 py-1 rounded text-xs">
              {process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || 'http://localhost:8080'}
            </code>
          </p>
          <p className="text-parallax-gray text-sm">
            Make sure the control plane is running and accessible.
          </p>
        </div>
      </div>
    );
  }

  // Check if enterprise is required
  if (requireEnterprise && !isEnterprise) {
    return <UpgradePrompt feature={requiredFeature} />;
  }

  // Check if specific feature is required
  if (requiredFeature && !hasFeature(requiredFeature)) {
    return <UpgradePrompt feature={requiredFeature} />;
  }

  return (
    <LicenseContext.Provider value={{ license, isLoading, isEnterprise, hasFeature }}>
      {children}
    </LicenseContext.Provider>
  );
}
