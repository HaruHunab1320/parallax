'use client';

import { AuthProvider } from '@/components/auth';
import { LicenseProvider } from '@/components/license';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <LicenseProvider requireEnterprise={true} requiredFeature="web_dashboard">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-auto p-6 bg-parallax-dark">
              {children}
            </main>
          </div>
        </div>
      </LicenseProvider>
    </AuthProvider>
  );
}
