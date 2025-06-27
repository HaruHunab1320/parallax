// Temporarily define AgentResult here until runtime package is fixed
export interface AgentResult<T> {
  value: T;
  confidence: number;
  agent: string;
  reasoning?: string;
  uncertainties?: string[];
  timestamp: number;
}

export interface WithConfidenceOptions {
  defaultConfidence?: number;
  extractConfidence?: (result: any) => number;
}

export function withConfidence(options: WithConfidenceOptions = {}) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: any,
      ...args: any[]
    ): Promise<AgentResult<any>> {
      const result = await originalMethod.apply(this, args);

      // If result is already an AgentResult, return it
      if (result && typeof result === 'object' && 'confidence' in result) {
        return result;
      }

      // Extract confidence from result or use default
      let confidence = options.defaultConfidence ?? 0.5;
      if (options.extractConfidence) {
        confidence = options.extractConfidence(result);
      } else if (Array.isArray(result) && result.length === 2) {
        // Convention: [value, confidence]
        return this.createResult(result[0], result[1]);
      }

      return this.createResult(result, confidence);
    };

    return descriptor;
  };
}