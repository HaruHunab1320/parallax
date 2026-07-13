'use client';

import React, { useState, useEffect } from 'react';
import { TerminalGrid } from '@/components/terminal/TerminalGrid';
import { Monitor, Play, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ThreadsPage() {
  const [executionId, setExecutionId] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
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

      </div>

      {/* Terminal grid — panes discovered from the event stream */}
      {isStreaming && executionId && (
        <TerminalGrid baseUrl={baseUrl} executionId={executionId} />
      )}

      {/* Empty state */}
      {!isStreaming && (
        <div className="glass-panel p-12 text-center">
          <Monitor className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg text-gray-400 mb-2">No Active Stream</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Enter an execution ID above to stream live terminal output from
            its threads. Panes appear automatically as agents come up,
            labelled by their role.
          </p>
        </div>
      )}
    </div>
  );
}
