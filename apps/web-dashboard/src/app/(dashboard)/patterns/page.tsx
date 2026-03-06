'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { GitBranch, RefreshCw, Play, Eye, Search, CheckCircle, XCircle, Info, Upload, X, FileUp } from 'lucide-react';

interface Pattern {
  name: string;
  description: string;
  version?: string;
  type?: string;
  agentCount?: number;
  metadata?: {
    inputSchema?: any;
    outputSchema?: any;
    tags?: string[];
  };
}

interface PatternStats {
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
}

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [executeModal, setExecuteModal] = useState<Pattern | null>(null);
  const [executeInput, setExecuteInput] = useState('{}');
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<any>(null);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<Array<{ name: string; content: string }>>([]);
  const [uploadOverwrite, setUploadOverwrite] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<Array<{ filename: string; success: boolean; error?: string }> | null>(null);

  const fetchPatterns = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/api/patterns');
      setPatterns(data.patterns || []);
    } catch (error) {
      console.error('Failed to fetch patterns:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatterns();
  }, []);

  const filteredPatterns = patterns.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExecute = async () => {
    if (!executeModal) return;

    setExecuting(true);
    setExecuteResult(null);

    try {
      const input = JSON.parse(executeInput);
      const result = await apiClient.post(`/api/patterns/${executeModal.name}/execute`, { input });
      setExecuteResult(result);
    } catch (error) {
      setExecuteResult({ error: (error as Error).message });
    } finally {
      setExecuting(false);
    }
  };

  const scaffoldFromSchema = (schema: any): string => {
    if (!schema?.properties) return '{}';
    const obj: Record<string, any> = {};
    for (const [key, prop] of Object.entries<any>(schema.properties)) {
      if (prop.default !== undefined) {
        obj[key] = prop.default;
      } else {
        switch (prop.type) {
          case 'string': obj[key] = ''; break;
          case 'number': case 'integer': obj[key] = 0; break;
          case 'boolean': obj[key] = false; break;
          case 'array': obj[key] = []; break;
          case 'object': obj[key] = {}; break;
          default: obj[key] = null;
        }
      }
    }
    return JSON.stringify(obj, null, 2);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadFiles((prev) => {
          if (prev.some((f) => f.name === file.name)) return prev;
          return [...prev, { name: file.name, content: reader.result as string }];
        });
      };
      reader.readAsText(file);
    });

    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;

    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['prism', 'yaml', 'yml'].includes(ext || '')) return;

      const reader = new FileReader();
      reader.onload = () => {
        setUploadFiles((prev) => {
          if (prev.some((f) => f.name === file.name)) return prev;
          return [...prev, { name: file.name, content: reader.result as string }];
        });
      };
      reader.readAsText(file);
    });
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;

    setUploading(true);
    setUploadResults(null);

    try {
      const { results } = await apiClient.uploadPatterns(
        uploadFiles.map((f) => ({ filename: f.name, content: f.content })),
        uploadOverwrite
      );
      setUploadResults(results);

      if (results.some((r) => r.success)) {
        fetchPatterns();
      }
    } catch (error) {
      setUploadResults([{ filename: 'batch', success: false, error: (error as Error).message }]);
    } finally {
      setUploading(false);
    }
  };

  const getPatternTypeColor = (type?: string) => {
    switch (type) {
      case 'voting':
        return 'bg-blue-500/20 text-blue-400';
      case 'consensus':
        return 'bg-purple-500/20 text-purple-400';
      case 'merge':
        return 'bg-green-500/20 text-green-400';
      case 'sequential':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'parallel':
        return 'bg-orange-500/20 text-orange-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Patterns</h1>
          <p className="text-gray-400 mt-1">View and execute coordination patterns</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setUploadModal(true);
              setUploadFiles([]);
              setUploadResults(null);
              setUploadOverwrite(false);
            }}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Pattern
          </Button>
          <Button variant="outline" onClick={fetchPatterns}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search patterns..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-parallax-accent"
        />
      </div>

      {/* Pattern Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading patterns...</div>
      ) : filteredPatterns.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {searchQuery ? 'No patterns match your search' : 'No patterns found'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPatterns.map((pattern) => (
            <Card
              key={pattern.name}
              className="cursor-pointer hover:border-parallax-accent/50 transition-colors"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-parallax-accent/20 flex items-center justify-center">
                      <GitBranch className="w-5 h-5 text-parallax-accent" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{pattern.name}</CardTitle>
                      {pattern.version && (
                        <p className="text-sm text-gray-400">v{pattern.version}</p>
                      )}
                    </div>
                  </div>
                  {pattern.type && (
                    <span className={`px-2 py-1 text-xs rounded-md ${getPatternTypeColor(pattern.type)}`}>
                      {pattern.type}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-gray-300 line-clamp-2">
                    {pattern.description || 'No description'}
                  </p>

                  {pattern.metadata?.tags && pattern.metadata.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {pattern.metadata.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs bg-white/10 rounded-md text-gray-300"
                        >
                          {tag}
                        </span>
                      ))}
                      {pattern.metadata.tags.length > 3 && (
                        <span className="px-2 py-1 text-xs bg-white/10 rounded-md text-gray-400">
                          +{pattern.metadata.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPattern(pattern);
                      }}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExecuteModal(pattern);
                        setExecuteInput(scaffoldFromSchema(pattern.metadata?.inputSchema));
                        setExecuteResult(null);
                      }}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Execute
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pattern Details Modal */}
      {selectedPattern && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-3xl max-h-[80vh] overflow-auto">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{selectedPattern.name}</CardTitle>
                  {selectedPattern.version && (
                    <p className="text-sm text-gray-400 mt-1">Version {selectedPattern.version}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedPattern(null)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Description</h3>
                  <p className="text-white">{selectedPattern.description || 'No description'}</p>
                </div>

                {selectedPattern.type && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Pattern Type</h3>
                    <span className={`px-3 py-1 text-sm rounded-md ${getPatternTypeColor(selectedPattern.type)}`}>
                      {selectedPattern.type}
                    </span>
                  </div>
                )}

                {selectedPattern.metadata?.inputSchema && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Input Schema</h3>
                    <pre className="text-sm bg-white/5 p-4 rounded-lg overflow-auto">
                      {JSON.stringify(selectedPattern.metadata.inputSchema, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedPattern.metadata?.tags && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedPattern.metadata.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1 text-sm bg-parallax-accent/20 text-parallax-accent rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    onClick={() => {
                      setSelectedPattern(null);
                      setExecuteModal(selectedPattern);
                      setExecuteInput(scaffoldFromSchema(selectedPattern.metadata?.inputSchema));
                      setExecuteResult(null);
                    }}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Execute Pattern
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Execute Modal */}
      {executeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto">
            <CardHeader>
              <CardTitle>Execute: {executeModal.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {executeModal.metadata?.inputSchema && (
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-parallax-accent" />
                      <span className="text-sm font-medium text-gray-300">Expected Input</span>
                    </div>
                    <div className="space-y-1">
                      {Object.entries<any>(executeModal.metadata.inputSchema.properties || {}).map(
                        ([key, prop]) => {
                          const isRequired = (executeModal.metadata?.inputSchema?.required || []).includes(key);
                          return (
                            <div key={key} className="flex items-baseline gap-2 text-sm">
                              <code className="text-parallax-accent">{key}</code>
                              <span className="text-gray-500">{prop.type || 'any'}</span>
                              {isRequired && (
                                <span className="text-xs text-red-400">required</span>
                              )}
                              {prop.description && (
                                <span className="text-gray-400">— {prop.description}</span>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-400 mb-2 block">
                    Input (JSON)
                  </label>
                  <textarea
                    value={executeInput}
                    onChange={(e) => setExecuteInput(e.target.value)}
                    className="w-full h-40 p-4 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-parallax-accent"
                    placeholder='{"key": "value"}'
                  />
                </div>

                {executeResult && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      {executeResult.error ? (
                        <>
                          <XCircle className="w-5 h-5 text-red-500" />
                          <span className="text-sm font-medium text-red-500">Execution Failed</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5 text-green-500" />
                          <span className="text-sm font-medium text-green-500">Execution Complete</span>
                        </>
                      )}
                    </div>
                    <pre className="text-sm bg-white/5 p-4 rounded-lg overflow-auto max-h-60">
                      {JSON.stringify(executeResult, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setExecuteModal(null);
                      setExecuteResult(null);
                    }}
                  >
                    {executeResult ? 'Close' : 'Cancel'}
                  </Button>
                  {!executeResult && (
                    <Button onClick={handleExecute} disabled={executing}>
                      {executing ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Execute
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Upload Patterns</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setUploadModal(false)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center hover:border-parallax-accent/50 transition-colors"
                >
                  <FileUp className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-300 mb-2">Drag & drop pattern files here</p>
                  <p className="text-sm text-gray-500 mb-3">Accepts .prism, .yaml, .yml files</p>
                  <label className="cursor-pointer">
                    <span className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white transition-colors">
                      Browse Files
                    </span>
                    <input
                      type="file"
                      accept=".prism,.yaml,.yml"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* File list */}
                {uploadFiles.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-400">
                      Selected Files ({uploadFiles.length})
                    </h3>
                    {uploadFiles.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between p-2 bg-white/5 rounded-md"
                      >
                        <span className="text-sm text-white">{file.name}</span>
                        <button
                          onClick={() => setUploadFiles((prev) => prev.filter((f) => f.name !== file.name))}
                          className="text-gray-400 hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Overwrite toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uploadOverwrite}
                    onChange={(e) => setUploadOverwrite(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  <span className="text-sm text-gray-300">Overwrite existing patterns</span>
                </label>

                {/* Upload results */}
                {uploadResults && (
                  <div className="space-y-2">
                    {uploadResults.map((result, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {result.success ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span className={result.success ? 'text-green-400' : 'text-red-400'}>
                          {result.filename}
                        </span>
                        {result.error && (
                          <span className="text-gray-500">— {result.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setUploadModal(false)}>
                    {uploadResults ? 'Close' : 'Cancel'}
                  </Button>
                  {!uploadResults && (
                    <Button
                      onClick={handleUpload}
                      disabled={uploading || uploadFiles.length === 0}
                    >
                      {uploading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload {uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
