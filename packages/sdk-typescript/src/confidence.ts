/**
 * Confidence extraction decorator using @prism-lang/confidence
 */

// Mock implementation until @prism-lang/confidence is properly configured
function extractConfidence(result: any): number {
  // Extract confidence from result based on keywords
  if (typeof result === 'object' && result !== null) {
    // Check for explicit confidence field
    if (typeof result.confidence === 'number') {
      return result.confidence;
    }
    
    // Check for confidence keywords
    let confidence = 0.5; // default
    
    if (result.certainly || result.definitely || result.absolutely) {
      confidence = 0.95;
    } else if (result.probably || result.likely) {
      confidence = 0.8;
    } else if (result.maybe || result.possibly || result.perhaps) {
      confidence = 0.6;
    } else if (result.unlikely || result.doubtful) {
      confidence = 0.3;
    }
    
    // Adjust based on uncertainties
    if (result.uncertainties && Array.isArray(result.uncertainties)) {
      confidence -= result.uncertainties.length * 0.1;
    }
    
    return Math.max(0.1, Math.min(1, confidence));
  }
  
  return 0.5; // default confidence
}

/**
 * Decorator that automatically extracts confidence from agent responses
 * using the @prism-lang/confidence package
 * 
 * @example
 * ```typescript
 * class MyAgent extends ParallaxAgent {
 *   @withConfidence
 *   async analyze(task: string, data?: any): Promise<[any, number]> {
 *     const result = await this.llm.analyze(data);
 *     // Decorator will extract confidence automatically
 *     return result;
 *   }
 * }
 * ```
 */
export function withConfidence(
  _target: any,
  _propertyName: string,
  descriptor: PropertyDescriptor
) {
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error('withConfidence can only be applied to methods');
  }

  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const result = await originalMethod.apply(this, args);
    
    // Check if the result is already in the expected format [result, confidence]
    if (Array.isArray(result) && result.length === 2 && typeof result[1] === 'number') {
      return result;
    }
    
    // Extract confidence using @prism-lang/confidence
    const confidence = extractConfidence(result);
    
    // Return as tuple [result, confidence]
    return [result, confidence];
  };

  return descriptor;
}

/**
 * Alternative functional wrapper for confidence extraction
 * 
 * @example
 * ```typescript
 * const analyzeWithConfidence = withConfidenceWrapper(async (task, data) => {
 *   return await llm.analyze(data);
 * });
 * ```
 */
export function withConfidenceWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => Promise<[any, number]> {
  return async (...args: Parameters<T>) => {
    const result = await fn(...args);
    
    // Check if already has confidence
    if (Array.isArray(result) && result.length === 2 && typeof result[1] === 'number') {
      return result as [any, number];
    }
    
    // Extract confidence
    const confidence = extractConfidence(result);
    
    return [result, confidence] as [any, number];
  };
}
