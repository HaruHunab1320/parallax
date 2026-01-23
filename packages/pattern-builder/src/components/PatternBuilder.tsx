/**
 * Pattern Builder Component
 *
 * Main component that assembles the visual pattern builder
 */

import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Canvas } from './Canvas/Canvas';
import { NodePalette } from './Palette/NodePalette';
import { PropertiesPanel } from './Panels/PropertiesPanel';
import { usePatternStore } from '../hooks/usePatternStore';
import { EXAMPLE_PATTERNS, ExamplePattern } from '../data/example-patterns';

export interface PatternBuilderProps {
  /** Additional CSS classes */
  className?: string;
  /** Initial pattern YAML to load */
  initialYaml?: string;
  /** Callback when pattern changes */
  onChange?: (yaml: string) => void;
  /** Callback when pattern is saved */
  onSave?: (yaml: string) => void;
  /** Show/hide the YAML preview panel */
  showYamlPreview?: boolean;
}

export function PatternBuilder({
  className,
  onChange,
  onSave,
  showYamlPreview = false,
}: PatternBuilderProps) {
  const [isYamlVisible, setIsYamlVisible] = useState(showYamlPreview);
  const [showExamples, setShowExamples] = useState(false);
  const { metadata, setMetadata, exportYaml, validate, errors, warnings, loadPattern } =
    usePatternStore();

  const handleLoadPattern = (pattern: ExamplePattern) => {
    loadPattern(pattern);
    setShowExamples(false);
  };

  const handleExport = () => {
    if (validate()) {
      const yaml = exportYaml();
      onChange?.(yaml);
      return yaml;
    }
    return null;
  };

  const handleSave = () => {
    const yaml = handleExport();
    if (yaml) {
      onSave?.(yaml);
    }
  };

  return (
    <div
      className={clsx(
        'flex flex-col h-full bg-white',
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={metadata.name}
            onChange={(e) => setMetadata({ name: e.target.value })}
            className="font-semibold text-lg bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
          />
          <span className="text-xs text-slate-400">v{metadata.version}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Validation status */}
          {errors.length > 0 && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              {errors.length} error{errors.length > 1 ? 's' : ''}
            </span>
          )}
          {warnings.length > 0 && errors.length === 0 && (
            <span className="text-xs text-amber-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full" />
              {warnings.length} warning{warnings.length > 1 ? 's' : ''}
            </span>
          )}
          {errors.length === 0 && warnings.length === 0 && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              Valid
            </span>
          )}

          {/* Actions */}
          <div className="relative">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className={clsx(
                'px-3 py-1.5 text-xs rounded',
                showExamples
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              Examples
            </button>

            {/* Examples Dropdown */}
            {showExamples && (
              <div className="absolute top-full right-0 mt-1 w-80 bg-white rounded-lg shadow-lg border border-slate-200 z-50 overflow-hidden">
                <div className="p-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase">
                    Load Example Pattern
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {EXAMPLE_PATTERNS.map((pattern) => (
                    <button
                      key={pattern.id}
                      onClick={() => handleLoadPattern(pattern)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    >
                      <div className="font-medium text-sm text-slate-700">
                        {pattern.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {pattern.description}
                      </div>
                      <div className="mt-1">
                        <span className={clsx(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          pattern.category === 'voting' && 'bg-blue-100 text-blue-700',
                          pattern.category === 'quality' && 'bg-green-100 text-green-700',
                          pattern.category === 'extraction' && 'bg-amber-100 text-amber-700',
                          pattern.category === 'verification' && 'bg-purple-100 text-purple-700',
                          pattern.category === 'performance' && 'bg-red-100 text-red-700'
                        )}>
                          {pattern.category}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsYamlVisible(!isYamlVisible)}
            className={clsx(
              'px-3 py-1.5 text-xs rounded',
              isYamlVisible
                ? 'bg-slate-200 text-slate-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {isYamlVisible ? 'Hide YAML' : 'Show YAML'}
          </button>

          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Save Pattern
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node Palette */}
        <NodePalette className="w-56 flex-shrink-0" />

        {/* Canvas */}
        <div className="flex-1 relative">
          <Canvas className="absolute inset-0" />
        </div>

        {/* Properties Panel */}
        <PropertiesPanel className="w-72 flex-shrink-0" />

        {/* YAML Preview */}
        {isYamlVisible && (
          <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-slate-900 text-slate-100 p-4 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                YAML Output
              </span>
              <button
                onClick={() => {
                  const yaml = exportYaml();
                  navigator.clipboard.writeText(yaml);
                }}
                className="text-xs text-slate-400 hover:text-white"
              >
                Copy
              </button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {exportYaml()}
            </pre>
          </div>
        )}
      </div>

      {/* Footer with description */}
      <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
        <input
          type="text"
          value={metadata.description}
          onChange={(e) => setMetadata({ description: e.target.value })}
          placeholder="Pattern description..."
          className="w-full text-sm text-slate-600 bg-transparent border-none focus:outline-none"
        />
      </div>
    </div>
  );
}

export default PatternBuilder;
