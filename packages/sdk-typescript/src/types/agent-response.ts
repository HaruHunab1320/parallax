/**
 * Standardized agent response format with automatic confidence
 */

export interface AgentResponse<T = any> {
  /**
   * The actual result value from the agent
   */
  value: T;

  /**
   * Confidence score between 0 and 1
   * If not provided, will be extracted automatically
   */
  confidence: number;

  /**
   * Agent identifier
   */
  agent: string;

  /**
   * Optional reasoning explanation
   */
  reasoning?: string;

  /**
   * Optional list of uncertainties or caveats
   */
  uncertainties?: string[];

  /**
   * Optional metadata about the response
   */
  metadata?: {
    /**
     * Model used (for LLM-based agents)
     */
    model?: string;

    /**
     * Number of tokens used
     */
    tokensUsed?: number;

    /**
     * Response latency in milliseconds
     */
    latency?: number;

    /**
     * Timestamp of response
     */
    timestamp?: number;

    /**
     * Any additional metadata
     */
    [key: string]: any;
  };
}

/**
 * Response specifically for analysis tasks
 */
export interface AnalysisResponse extends AgentResponse {
  value: {
    findings: any[];
    summary: string;
    recommendations?: string[];
  };
}

/**
 * Response for validation tasks
 */
export interface ValidationResponse extends AgentResponse {
  value: {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
  };
}

/**
 * Response for generation tasks
 */
export interface GenerationResponse extends AgentResponse {
  value: {
    generated: string;
    alternatives?: string[];
  };
}

/**
 * Helper to ensure response has confidence
 */
export function ensureConfidence<T>(response: Partial<AgentResponse<T>>): AgentResponse<T> {
  return {
    ...response,
    confidence: response.confidence ?? 0.5,
    agent: response.agent ?? 'unknown',
    metadata: {
      ...response.metadata,
      timestamp: response.metadata?.timestamp ?? Date.now()
    }
  } as AgentResponse<T>;
}