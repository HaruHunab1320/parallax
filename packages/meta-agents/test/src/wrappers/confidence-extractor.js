"use strict";
/**
 * Confidence Extractor Wrapper
 *
 * Automatically extracts confidence from agent responses
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfidenceAggregator = void 0;
exports.withConfidence = withConfidence;
/**
 * Decorator for automatic confidence extraction
 */
function withConfidence(options = {}) {
    const defaultConfidence = options.defaultConfidence || 0.5;
    const strategy = options.extractionStrategy || 'hybrid';
    return function (target, propertyName, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const result = await originalMethod.apply(this, args);
            // If already has confidence, return as-is
            if (Array.isArray(result) && result.length === 2) {
                return result;
            }
            // Extract confidence based on strategy
            let confidence = defaultConfidence;
            if (strategy === 'llm' || strategy === 'hybrid') {
                confidence = extractConfidenceFromLLM(result);
            }
            if (strategy === 'keywords' || strategy === 'hybrid') {
                const keywordConfidence = extractConfidenceFromKeywords(result);
                if (strategy === 'hybrid') {
                    // Average the two methods
                    confidence = (confidence + keywordConfidence) / 2;
                }
                else {
                    confidence = keywordConfidence;
                }
            }
            // Return [result, confidence] tuple
            return [result, confidence];
        };
        return descriptor;
    };
}
/**
 * Extract confidence from LLM response
 */
function extractConfidenceFromLLM(result) {
    if (!result)
        return 0.5;
    // Check for explicit confidence in response
    if (typeof result === 'object') {
        if ('confidence' in result)
            return normalizeConfidence(result.confidence);
        if ('_confidence' in result)
            return normalizeConfidence(result._confidence);
        if ('score' in result)
            return normalizeConfidence(result.score);
        if ('certainty' in result)
            return normalizeConfidence(result.certainty);
    }
    // Check for confidence in text
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    const confidenceMatch = text.match(/confidence[:\s]+(\d+\.?\d*)/i);
    if (confidenceMatch) {
        return normalizeConfidence(parseFloat(confidenceMatch[1]));
    }
    // Check for percentage
    const percentMatch = text.match(/(\d+\.?\d*)\s*%/);
    if (percentMatch) {
        return parseFloat(percentMatch[1]) / 100;
    }
    return 0.7; // Default for LLM responses
}
/**
 * Extract confidence from keywords
 */
function extractConfidenceFromKeywords(result) {
    const text = typeof result === 'string' ? result : JSON.stringify(result).toLowerCase();
    // High confidence indicators
    const highConfidence = [
        'definitely', 'certainly', 'absolutely', 'confirmed',
        'verified', 'guaranteed', 'certain', 'sure', 'clear',
        'obvious', 'undoubtedly', 'unquestionably'
    ];
    // Medium confidence indicators
    const mediumConfidence = [
        'probably', 'likely', 'appears', 'seems', 'suggests',
        'indicates', 'mostly', 'generally', 'typically'
    ];
    // Low confidence indicators
    const lowConfidence = [
        'possibly', 'maybe', 'might', 'could', 'uncertain',
        'unclear', 'unsure', 'doubt', 'guess', 'assume',
        'questionable', 'tentative'
    ];
    let score = 0.5; // Start neutral
    // Count indicators
    highConfidence.forEach(word => {
        if (text.includes(word))
            score += 0.15;
    });
    mediumConfidence.forEach(word => {
        if (text.includes(word))
            score += 0.05;
    });
    lowConfidence.forEach(word => {
        if (text.includes(word))
            score -= 0.15;
    });
    // Clamp between 0 and 1
    return Math.max(0.1, Math.min(0.95, score));
}
/**
 * Normalize confidence value to 0-1 range
 */
function normalizeConfidence(value) {
    if (typeof value !== 'number') {
        return 0.5;
    }
    // Already in 0-1 range
    if (value >= 0 && value <= 1) {
        return value;
    }
    // Percentage (0-100)
    if (value > 1 && value <= 100) {
        return value / 100;
    }
    // Out of bounds
    return 0.5;
}
/**
 * Confidence aggregation utilities
 */
class ConfidenceAggregator {
    /**
     * Combine multiple confidence values
     */
    static combine(confidences, strategy = 'avg') {
        if (confidences.length === 0)
            return 0.5;
        switch (strategy) {
            case 'min':
                return Math.min(...confidences);
            case 'max':
                return Math.max(...confidences);
            case 'avg':
                return confidences.reduce((a, b) => a + b, 0) / confidences.length;
            case 'weighted':
                // Later confidences have more weight
                let weightedSum = 0;
                let weightSum = 0;
                confidences.forEach((conf, idx) => {
                    const weight = idx + 1;
                    weightedSum += conf * weight;
                    weightSum += weight;
                });
                return weightedSum / weightSum;
            default:
                return confidences.reduce((a, b) => a + b, 0) / confidences.length;
        }
    }
    /**
     * Adjust confidence based on consistency
     */
    static fromConsistency(results) {
        if (results.length < 2)
            return 0.5;
        // Convert results to strings for comparison
        const stringResults = results.map(r => typeof r === 'string' ? r : JSON.stringify(r));
        // Count unique results
        const unique = new Set(stringResults);
        // High consistency = high confidence
        const consistency = 1 - (unique.size - 1) / (results.length - 1);
        // Map consistency to confidence (0.5 to 0.95)
        return 0.5 + (consistency * 0.45);
    }
}
exports.ConfidenceAggregator = ConfidenceAggregator;
