import { HttpClient } from '../http.js';
import {
  Pattern,
  PatternListResponse,
  PatternValidation,
  PatternExecuteResponse,
  PatternMetricsResponse,
  PatternCreateInput,
  PatternUploadInput,
  PatternUploadResponse,
  PatternBatchUploadInput,
  PatternBatchUploadResponse,
  PatternVersionsResponse,
  PatternExecuteOptions,
} from '../types/patterns.js';
import * as fs from 'fs';
import * as path from 'path';

export class PatternsResource {
  constructor(private http: HttpClient) {}

  /** List all registered patterns */
  async list(): Promise<PatternListResponse> {
    return this.http.get<PatternListResponse>('/api/patterns');
  }

  /** Get a pattern by name */
  async get(name: string): Promise<Pattern> {
    return this.http.get<Pattern>(`/api/patterns/${encodeURIComponent(name)}`);
  }

  /** Validate input against a pattern's schema */
  async validate(name: string, input: unknown): Promise<PatternValidation> {
    return this.http.post<PatternValidation>(
      `/api/patterns/${encodeURIComponent(name)}/validate`,
      { input }
    );
  }

  /** Execute a pattern synchronously */
  async execute(
    name: string,
    input: unknown,
    options?: PatternExecuteOptions
  ): Promise<PatternExecuteResponse> {
    return this.http.post<PatternExecuteResponse>(
      `/api/patterns/${encodeURIComponent(name)}/execute`,
      { input, options }
    );
  }

  /** Get execution metrics for a pattern */
  async metrics(name: string): Promise<PatternMetricsResponse> {
    return this.http.get<PatternMetricsResponse>(
      `/api/patterns/${encodeURIComponent(name)}/metrics`
    );
  }

  // --- Enterprise Pattern Management ---

  /** Create a new pattern (Enterprise) */
  async create(input: PatternCreateInput): Promise<Pattern> {
    return this.http.post<Pattern>('/api/patterns', input);
  }

  /** Update an existing pattern (Enterprise) */
  async update(name: string, updates: Partial<PatternCreateInput>): Promise<Pattern> {
    return this.http.put<Pattern>(
      `/api/patterns/${encodeURIComponent(name)}`,
      updates
    );
  }

  /** Delete a pattern (Enterprise) */
  async delete(name: string): Promise<void> {
    await this.http.delete(`/api/patterns/${encodeURIComponent(name)}`);
  }

  /** Upload a pattern file (.prism, .yaml, .yml) (Enterprise) */
  async upload(input: PatternUploadInput): Promise<PatternUploadResponse> {
    return this.http.post<PatternUploadResponse>('/api/patterns/upload', input);
  }

  /**
   * Upload a pattern from a local file path (Enterprise)
   *
   * Reads the file from disk and uploads it.
   */
  async uploadFile(filePath: string, overwrite = false): Promise<PatternUploadResponse> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);
    return this.upload({ filename, content, overwrite });
  }

  /** Batch upload multiple pattern files (Enterprise) */
  async uploadBatch(input: PatternBatchUploadInput): Promise<PatternBatchUploadResponse> {
    return this.http.post<PatternBatchUploadResponse>('/api/patterns/upload/batch', input);
  }

  /** Get version history for a pattern (Enterprise) */
  async versions(name: string): Promise<PatternVersionsResponse> {
    return this.http.get<PatternVersionsResponse>(
      `/api/patterns/${encodeURIComponent(name)}/versions`
    );
  }
}
