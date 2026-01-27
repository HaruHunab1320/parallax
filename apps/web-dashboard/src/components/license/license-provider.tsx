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

  // Dev mode bypass - skip license check entirely
  const devBypass = process.env.NEXT_PUBLIC_DEV_BYPASS_LICENSE === 'true';

  useEffect(() => {
    async function checkLicense() {
      // If dev bypass is enabled, assume enterprise
      if (devBypass) {
        console.log('[LicenseProvider] Dev bypass enabled, assuming enterprise');
        setLicense({ type: 'enterprise', features: ['web_dashboard', 'all_features'] });
        setIsLoading(false);
        return;
      }

      try {
        console.log('[LicenseProvider] Fetching license from API...');
        const licenseInfo = await apiClient.getLicense();
        console.log('[LicenseProvider] License response:', licenseInfo);
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
  }, [devBypass]);

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
              {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}
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
