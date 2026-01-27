'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Bot,
  GitBranch,
  Activity,
  Settings,
  BarChart3,
  Zap,
  Clock,
  Users,
} from 'lucide-react';

const navItems = [
  {
    title: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Agents',
    href: '/agents',
    icon: Bot,
  },
  {
    title: 'Patterns',
    href: '/patterns',
    icon: GitBranch,
  },
  {
    title: 'Executions',
    href: '/executions',
    icon: Zap,
  },
  {
    title: 'Schedules',
    href: '/schedules',
    icon: Clock,
  },
  {
    title: 'Metrics',
    href: '/metrics',
    icon: BarChart3,
  },
  {
    title: 'Tracing',
    href: '/tracing',
    icon: Activity,
  },
  {
    title: 'Users',
    href: '/users',
    icon: Users,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 h-full glass-panel border-r border-white/10">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <span className="text-parallax-accent">⚡</span>
          Parallax
        </h1>
        <p className="text-sm text-gray-400 mt-1">AI Orchestration Platform</p>
      </div>

      <nav className="px-4 pb-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-parallax-accent/20 text-parallax-accent'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-4">
        <div className="glass-panel p-4">
          <div className="flex items-center gap-2 text-sm">
            <div className="status-indicator status-healthy" />
            <span className="text-gray-400">System Status:</span>
            <span className="text-green-500 font-medium">Healthy</span>
          </div>
        </div>
      </div>
    </div>
  );
}