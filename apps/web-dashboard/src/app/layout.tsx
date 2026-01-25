import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { LicenseProvider } from '@/components/license';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Parallax Dashboard',
  description: 'AI Coordination Platform Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
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
      </body>
    </html>
  );
}
