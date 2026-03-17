'use client';

import React, { useState, useEffect } from 'react';
import { TerminalGrid, ThreadConfig } from '@/components/terminal/TerminalGrid';
import { Monitor, Play, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// Default coding swarm thread configuration
const DEFAULT_THREADS: ThreadConfig[] = [
  { threadId: 'architect', agentName: 'Echo', agentType: 'claude', role: 'architect' },
  { threadId: 'engineer_a', agentName: 'Vero', agentType: 'claude', role: 'engineer_a' },
  { threadId: 'engineer_b', agentName: 'Sable', agentType: 'codex', role: 'engineer_b' },
  { threadId: 'engineer_c', agentName: 'Silas', agentType: 'gemini', role: 'engineer_c' },
];

export default function ThreadsPage() {
  const [executionId, setExecutionId] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [threads] = useState<ThreadConfig[]>(DEFAULT_THREADS);
  const [isStreaming, setIsStreaming] = useState(false);

  // Auto-detect base URL
  useEffect(() => {
    const stored = typeof window !== 'undefined'
      ? localStorage.getItem('parallax_api_url')
      : null;
    setBaseUrl(stored || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080');
  }, []);

  const handleStart = () => {
    if (inputValue.trim()) {
      setExecutionId(inputValue.trim());
      setIsStreaming(true);
    }
  };

  const handleStop = () => {
    setIsStreaming(false);
    setExecutionId('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleStart();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Monitor className="w-7 h-7 text-parallax-accent" />
            Thread Terminals
          </h1>
          <p className="text-gray-400 mt-1">
            Live terminal output from coding swarm threads
          </p>
        </div>
      </div>

      {/* Connection controls */}
      <div className="glass-panel p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-sm text-gray-400 mb-1 block">Execution ID</label>
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter execution ID to stream..."
              disabled={isStreaming}
              className={cn(
                'w-full px-3 py-2 rounded-lg bg-black/50 border border-parallax-border',
                'text-white placeholder-gray-600 text-sm font-mono',
                'focus:outline-none focus:border-parallax-accent',
                isStreaming && 'opacity-50'
              )}
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            {!isStreaming ? (
              <button
                onClick={handleStart}
                disabled={!inputValue.trim()}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputValue.trim()
                    ? 'bg-parallax-accent text-white hover:bg-parallax-accent/80'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                )}
              >
                <Play className="w-4 h-4" />
                Stream
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Thread configuration (collapsible) */}
        <details className="mt-4">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
            Thread Configuration ({threads.length} threads)
          </summary>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            {threads.map((t) => (
              <div key={t.threadId} className="flex items-center gap-2 bg-black/30 rounded px-2 py-1 text-xs">
                <span className={cn(
                  'w-2 h-2 rounded-full',
                  t.agentType === 'claude' ? 'bg-orange-500' :
                  t.agentType === 'codex' ? 'bg-green-500' :
                  t.agentType === 'gemini' ? 'bg-blue-500' : 'bg-gray-500'
                )} />
                <span className="text-gray-300 font-medium">{t.agentName}</span>
                <span className="text-gray-600">({t.agentType})</span>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Terminal grid */}
      {isStreaming && executionId && (
        <TerminalGrid
          baseUrl={baseUrl}
          executionId={executionId}
          threads={threads}
        />
      )}

      {/* Empty state */}
      {!isStreaming && (
        <div className="glass-panel p-12 text-center">
          <Monitor className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg text-gray-400 mb-2">No Active Stream</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Enter an execution ID above to stream live terminal output from
            coding swarm threads. The 2x2 grid shows output from all 4 agents
            (architect + 3 engineers) in real-time.
          </p>
        </div>
      )}
    </div>
  );
}
