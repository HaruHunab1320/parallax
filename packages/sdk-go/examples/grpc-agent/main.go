package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"

	"github.com/parallax/sdk-go/pkg/parallax"
)

// SentimentAgent is an example agent that analyzes sentiment
type SentimentAgent struct {
	id           string
	name         string
	capabilities []string
	metadata     map[string]string
}

func NewSentimentAgent() *SentimentAgent {
	return &SentimentAgent{
		id:           fmt.Sprintf("sentiment-agent-%d", rand.Intn(1000)),
		name:         "Go Sentiment Analyzer",
		capabilities: []string{"sentiment", "analysis", "nlp"},
		metadata: map[string]string{
			"language": "go",
			"version":  "1.0.0",
			"model":    "basic",
		},
	}
}

func (s *SentimentAgent) GetID() string {
	return s.id
}

func (s *SentimentAgent) GetName() string {
	return s.name
}

func (s *SentimentAgent) GetCapabilities() []string {
	return s.capabilities
}

func (s *SentimentAgent) GetMetadata() map[string]string {
	return s.metadata
}

func (s *SentimentAgent) Analyze(ctx context.Context, task string, data interface{}) (*parallax.AnalyzeResult, error) {
	// Simple sentiment analysis simulation
	text, ok := data.(string)
	if !ok {
		// Try to extract text from a map
		if m, ok := data.(map[string]interface{}); ok {
			if t, ok := m["text"].(string); ok {
				text = t
			}
		}
	}

	if text == "" {
		return nil, fmt.Errorf("no text provided for analysis")
	}

	// Simulate sentiment analysis
	sentiment := "neutral"
	confidence := 0.7 + rand.Float64()*0.25

	// Simple keyword matching
	positiveWords := []string{"good", "great", "excellent", "love", "amazing", "wonderful", "fantastic"}
	negativeWords := []string{"bad", "terrible", "hate", "awful", "horrible", "poor", "disappointing"}

	positiveCount := 0
	negativeCount := 0

	for _, word := range positiveWords {
		if containsWord(text, word) {
			positiveCount++
		}
	}

	for _, word := range negativeWords {
		if containsWord(text, word) {
			negativeCount++
		}
	}

	if positiveCount > negativeCount {
		sentiment = "positive"
		confidence = 0.8 + rand.Float64()*0.2
	} else if negativeCount > positiveCount {
		sentiment = "negative"
		confidence = 0.8 + rand.Float64()*0.2
	}

	result := &parallax.AnalyzeResult{
		Value: map[string]interface{}{
			"sentiment":      sentiment,
			"text":          text,
			"positiveWords": positiveCount,
			"negativeWords": negativeCount,
		},
		Confidence: confidence,
		Reasoning:  fmt.Sprintf("Analyzed text with %d positive and %d negative indicators", positiveCount, negativeCount),
		Uncertainties: []string{
			"Limited keyword matching",
			"No context understanding",
			"No sarcasm detection",
		},
		Metadata: map[string]string{
			"algorithm": "keyword-matching",
			"version":   "1.0",
		},
	}

	return result, nil
}

func (s *SentimentAgent) CheckHealth(ctx context.Context) (*parallax.HealthStatus, error) {
	// Simple health check
	return &parallax.HealthStatus{
		Status:  "healthy",
		Message: "Agent is operational",
	}, nil
}

func containsWord(text, word string) bool {
	// Simple case-insensitive contains check
	// In production, use proper NLP tokenization
	return len(text) > 0 && len(word) > 0 && 
		(text == word || 
		 text[:len(word)] == word ||
		 text[len(text)-len(word):] == word)
}

func main() {
	// Create sentiment agent
	agent := NewSentimentAgent()

	log.Printf("Starting %s with ID %s", agent.GetName(), agent.GetID())
	log.Printf("Capabilities: %v", agent.GetCapabilities())

	// Serve the agent
	if err := parallax.ServeAgent(agent, 0); err != nil {
		log.Fatal(err)
	}
}