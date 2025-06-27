'use client';

import React from 'react';
import { Bell, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  return (
    <header className="h-16 glass-panel border-b border-white/10 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search agents, patterns, executions..."
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-parallax-accent"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </Button>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-parallax-accent/20 flex items-center justify-center">
            <User className="w-4 h-4 text-parallax-accent" />
          </div>
          <div className="text-sm">
            <p className="font-medium">Admin</p>
            <p className="text-gray-400 text-xs">admin@parallax.ai</p>
          </div>
        </div>
      </div>
    </header>
  );
}