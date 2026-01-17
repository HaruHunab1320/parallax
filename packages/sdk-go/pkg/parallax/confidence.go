package parallax

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strings"
)

// ConfidenceExtractor provides methods for extracting confidence from results
type ConfidenceExtractor struct {
	DefaultConfidence float64
	Strategy          string // "llm", "keywords", or "hybrid"
}

// NewConfidenceExtractor creates a new confidence extractor
func NewConfidenceExtractor(defaultConfidence float64, strategy string) *ConfidenceExtractor {
	if strategy == "" {
		strategy = "hybrid"
	}
	return &ConfidenceExtractor{
		DefaultConfidence: defaultConfidence,
		Strategy:          strategy,
	}
}

// WithConfidence wraps an analysis function to automatically extract confidence
func WithConfidence(analyzeFunc func(ctx context.Context, task string, data interface{}) (interface{}, error), extractor *ConfidenceExtractor) func(ctx context.Context, task string, data interface{}) (*AgentResult, error) {
	if extractor == nil {
		extractor = NewConfidenceExtractor(0.5, "hybrid")
	}
	
	return func(ctx context.Context, task string, data interface{}) (*AgentResult, error) {
		result, err := analyzeFunc(ctx, task, data)
		if err != nil {
			return nil, err
		}
		
		// Check if result is already an AgentResult
		if agentResult, ok := result.(*AgentResult); ok {
			return agentResult, nil
		}
		
		// Extract confidence
		confidence := extractor.Extract(result)
		
		// Build AgentResult
		return &AgentResult{
			Value:      result,
			Confidence: confidence,
		}, nil
	}
}

// Extract extracts confidence from a result using the configured strategy
func (ce *ConfidenceExtractor) Extract(result interface{}) float64 {
	switch ce.Strategy {
	case "llm":
		return ce.extractFromLLM(result)
	case "keywords":
		return ce.extractFromKeywords(result)
	case "hybrid":
		llmConf := ce.extractFromLLM(result)
		keywordConf := ce.extractFromKeywords(result)
		// Weighted average favoring LLM extraction
		return 0.7*llmConf + 0.3*keywordConf
	default:
		return ce.DefaultConfidence
	}
}

// extractFromLLM extracts confidence from LLM-style responses
func (ce *ConfidenceExtractor) extractFromLLM(result interface{}) float64 {
	if result == nil {
		return ce.DefaultConfidence
	}
	
	// Check for map types
	if mapResult, ok := result.(map[string]interface{}); ok {
		// Direct confidence fields
		confidenceFields := []string{"confidence", "_confidence", "score", "certainty", "probability"}
		for _, field := range confidenceFields {
			if val, exists := mapResult[field]; exists {
				return normalizeConfidence(val)
			}
		}
		
		// Check nested metadata
		if metadata, ok := mapResult["metadata"].(map[string]interface{}); ok {
			for _, field := range confidenceFields {
				if val, exists := metadata[field]; exists {
					return normalizeConfidence(val)
				}
			}
		}
	}
	
	// Check for struct types using reflection
	rv := reflect.ValueOf(result)
	if rv.Kind() == reflect.Struct {
		rt := rv.Type()
		for i := 0; i < rv.NumField(); i++ {
			fieldName := strings.ToLower(rt.Field(i).Name)
			if fieldName == "confidence" || fieldName == "score" || fieldName == "certainty" {
				fieldValue := rv.Field(i)
				if fieldValue.CanInterface() {
					return normalizeConfidence(fieldValue.Interface())
				}
			}
		}
	}
	
	// Convert to string and search for patterns
	text := fmt.Sprintf("%v", result)
	patterns := []string{
		`confidence:\s*(\d+\.?\d*)`,
		`certainty:\s*(\d+\.?\d*)`,
		`probability:\s*(\d+\.?\d*)`,
		`score:\s*(\d+\.?\d*)`,
		`(\d+\.?\d*)\s*%\s*(?:confident|certain|sure)`,
	}
	
	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(text); len(matches) > 1 {
			return normalizeConfidence(matches[1])
		}
	}
	
	return ce.DefaultConfidence
}

// extractFromKeywords extracts confidence based on keyword analysis
func (ce *ConfidenceExtractor) extractFromKeywords(result interface{}) float64 {
	// Convert to string
	var text string
	if jsonBytes, err := json.Marshal(result); err == nil {
		text = string(jsonBytes)
	} else {
		text = fmt.Sprintf("%v", result)
	}
	text = strings.ToLower(text)
	
	score := ce.DefaultConfidence
	
	// High confidence indicators
	highConfidenceWords := map[string]float64{
		"definitely":      0.15,
		"certainly":       0.15,
		"absolutely":      0.15,
		"confirmed":       0.15,
		"verified":        0.15,
		"guaranteed":      0.15,
		"certain":         0.12,
		"sure":            0.12,
		"clear":           0.10,
		"obvious":         0.10,
		"undoubtedly":     0.12,
		"unquestionably":  0.12,
		"conclusive":      0.12,
		"definitive":      0.12,
		"established":     0.10,
	}
	
	// Medium confidence indicators
	mediumConfidenceWords := map[string]float64{
		"probably":    0.05,
		"likely":      0.05,
		"appears":     0.05,
		"seems":       0.05,
		"suggests":    0.05,
		"indicates":   0.05,
		"mostly":      0.04,
		"generally":   0.04,
		"typically":   0.04,
		"reasonable":  0.05,
		"plausible":   0.05,
		"expected":    0.04,
	}
	
	// Low confidence indicators
	lowConfidenceWords := map[string]float64{
		"possibly":      -0.15,
		"maybe":         -0.15,
		"might":         -0.12,
		"could":         -0.10,
		"uncertain":     -0.15,
		"unclear":       -0.15,
		"unsure":        -0.15,
		"doubt":         -0.15,
		"guess":         -0.12,
		"assume":        -0.10,
		"questionable":  -0.15,
		"tentative":     -0.12,
		"approximate":   -0.08,
		"estimated":     -0.08,
		"roughly":       -0.08,
	}
	
	// Apply modifiers
	for word, modifier := range highConfidenceWords {
		if strings.Contains(text, word) {
			score += modifier
		}
	}
	
	for word, modifier := range mediumConfidenceWords {
		if strings.Contains(text, word) {
			score += modifier
		}
	}
	
	for word, modifier := range lowConfidenceWords {
		if strings.Contains(text, word) {
			score += modifier
		}
	}
	
	// Check for hedging patterns
	hedgingPatterns := []string{
		`(?:i|we)\s+(?:think|believe|suppose)`,
		`(?:may|might)\s+be`,
		`(?:could|would)\s+(?:be|suggest)`,
		`(?:perhaps|presumably)`,
	}
	
	for _, pattern := range hedgingPatterns {
		if matched, _ := regexp.MatchString(pattern, text); matched {
			score -= 0.1
		}
	}
	
	// Clamp to valid range
	return math.Max(0.1, math.Min(0.95, score))
}

// normalizeConfidence normalizes a value to 0.0-1.0 range
func normalizeConfidence(value interface{}) float64 {
	switch v := value.(type) {
	case float64:
		if v >= 0 && v <= 1 {
			return v
		}
		if v > 1 && v <= 100 {
			return v / 100
		}
	case float32:
		return normalizeConfidence(float64(v))
	case int:
		return normalizeConfidence(float64(v))
	case int64:
		return normalizeConfidence(float64(v))
	case string:
		// Remove % sign if present
		v = strings.TrimSpace(strings.TrimSuffix(v, "%"))
		var f float64
		if _, err := fmt.Sscanf(v, "%f", &f); err == nil {
			return normalizeConfidence(f)
		}
	}
	
	return 0.5
}

// ConfidenceAggregator provides methods for aggregating confidence values
type ConfidenceAggregator struct{}

// Combine combines multiple confidence values using the specified strategy
func (ca *ConfidenceAggregator) Combine(confidences []float64, strategy string, weights []float64) float64 {
	if len(confidences) == 0 {
		return 0.5
	}
	
	switch strategy {
	case "min":
		min := confidences[0]
		for _, c := range confidences[1:] {
			if c < min {
				min = c
			}
		}
		return min
		
	case "max":
		max := confidences[0]
		for _, c := range confidences[1:] {
			if c > max {
				max = c
			}
		}
		return max
		
	case "avg":
		sum := 0.0
		for _, c := range confidences {
			sum += c
		}
		return sum / float64(len(confidences))
		
	case "weighted_avg":
		if len(weights) == len(confidences) {
			weightedSum := 0.0
			totalWeight := 0.0
			for i, c := range confidences {
				weightedSum += c * weights[i]
				totalWeight += weights[i]
			}
			if totalWeight > 0 {
				return weightedSum / totalWeight
			}
		}
		// Default to linearly increasing weights
		weightedSum := 0.0
		totalWeight := 0.0
		for i, c := range confidences {
			weight := float64(i + 1)
			weightedSum += c * weight
			totalWeight += weight
		}
		return weightedSum / totalWeight
		
	case "consensus":
		// Higher confidence when values agree
		mean := 0.0
		for _, c := range confidences {
			mean += c
		}
		mean /= float64(len(confidences))
		
		// Calculate variance
		variance := 0.0
		for _, c := range confidences {
			diff := c - mean
			variance += diff * diff
		}
		variance /= float64(len(confidences))
		
		// Low variance = high consensus
		consensusFactor := 1 - math.Min(variance*2, 0.5)
		return mean * consensusFactor
		
	default:
		// Default to average
		sum := 0.0
		for _, c := range confidences {
			sum += c
		}
		return sum / float64(len(confidences))
	}
}

// FromConsistency calculates confidence based on result consistency
func (ca *ConfidenceAggregator) FromConsistency(results []interface{}) float64 {
	if len(results) < 2 {
		return 0.5
	}
	
	// Convert results to comparable strings
	strResults := make([]string, len(results))
	for i, r := range results {
		if jsonBytes, err := json.Marshal(r); err == nil {
			strResults[i] = string(jsonBytes)
		} else {
			strResults[i] = fmt.Sprintf("%v", r)
		}
	}
	
	// Count unique results
	uniqueMap := make(map[string]bool)
	for _, s := range strResults {
		uniqueMap[s] = true
	}
	
	// Perfect agreement = high confidence
	if len(uniqueMap) == 1 {
		return 0.95
	}
	
	// Calculate consistency score
	consistency := 1 - float64(len(uniqueMap)-1)/float64(len(results)-1)
	
	// Map to confidence range 0.5-0.95
	return 0.5 + (consistency * 0.45)
}

// CalibrationData holds agent calibration information
type CalibrationData struct {
	Bias  float64 // Positive = overconfident
	Scale float64 // Adjust range
}

// Calibrate adjusts confidence based on historical accuracy
func (ca *ConfidenceAggregator) Calibrate(rawConfidence float64, calibration *CalibrationData) float64 {
	if calibration == nil {
		return rawConfidence
	}
	
	// Apply calibration
	calibrated := (rawConfidence-0.5)*calibration.Scale + 0.5 - calibration.Bias
	
	// Ensure valid range
	return math.Max(0.0, math.Min(1.0, calibrated))
}

// RequireMinimumConfidence wraps a function to ensure minimum confidence
func RequireMinimumConfidence(minConfidence float64, analyzeFunc func(ctx context.Context, task string, data interface{}) (*AgentResult, error)) func(ctx context.Context, task string, data interface{}) (*AgentResult, error) {
	return func(ctx context.Context, task string, data interface{}) (*AgentResult, error) {
		result, err := analyzeFunc(ctx, task, data)
		if err != nil {
			return nil, err
		}
		
		if result.Confidence < minConfidence {
			return nil, fmt.Errorf("confidence %.2f below required threshold %.2f", result.Confidence, minConfidence)
		}
		
		return result, nil
	}
}