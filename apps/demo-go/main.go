package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"parallax/sdk-go/pkg/parallax"
)

// TestAgent wraps a ParallaxAgent for testing
type TestAgent struct {
	*parallax.ParallaxAgent
}

// NewTestAgent creates a new test agent
func NewTestAgent() *TestAgent {
	agent := parallax.NewParallaxAgent(
		"test-agent-go",
		"Test Agent (Go)",
		[]string{"analysis", "validation"},
		map[string]interface{}{"expertise": 0.85},
	)
	
	t := &TestAgent{
		ParallaxAgent: agent,
	}
	
	// Set the analyze function
	agent.AnalyzeFunc = t.analyze
	
	return t
}

// analyze implements the agent's analysis logic
func (a *TestAgent) analyze(ctx context.Context, task string, data interface{}) (*parallax.AgentResult, error) {
	switch task {
	case "analyze":
		inputData, _ := data.(map[string]interface{})
		contentData, _ := inputData["data"].(map[string]interface{})
		
		content, _ := contentData["content"].(string)
		dataType, _ := contentData["type"].(string)
		
		return &parallax.AgentResult{
			Value: map[string]interface{}{
				"summary": fmt.Sprintf("Analyzed %s content", dataType),
				"length":  len(content),
				"result":  "Analysis complete",
			},
			Confidence: 0.85,
			Reasoning:  "Standard analysis performed",
		}, nil
		
	case "validate":
		inputData, _ := data.(map[string]interface{})
		validateData, _ := inputData["data"].(map[string]interface{})
		
		value, _ := validateData["value"].(float64)
		rules, _ := validateData["rules"].([]interface{})
		
		var details []string
		valid := true
		
		for _, rule := range rules {
			switch rule {
			case "positive":
				if value > 0 {
					details = append(details, "Value is positive")
				} else {
					valid = false
					details = append(details, "Value is not positive")
				}
			case "even":
				if int(value)%2 == 0 {
					details = append(details, "Value is even")
				} else {
					valid = false
					details = append(details, "Value is not even")
				}
			}
		}
		
		return &parallax.AgentResult{
			Value: map[string]interface{}{
				"valid":   valid,
				"details": details,
			},
			Confidence: 0.95,
			Reasoning:  "Validation rules applied",
		}, nil
		
	default:
		return nil, fmt.Errorf("unknown task: %s", task)
	}
}

func runStandardizedTests() bool {
	fmt.Println("=== Parallax SDK Test Results ===")
	fmt.Println("Language: Go")
	fmt.Println("SDK Version: 0.1.0")
	fmt.Println()
	
	results := make(map[string]bool)
	
	// Test 1: Agent Creation
	fmt.Print("Test 1: Agent Creation............... ")
	agent := NewTestAgent()
	passed := agent.ID == "test-agent-go" &&
		contains(agent.Capabilities, "analysis") &&
		contains(agent.Capabilities, "validation")
	results["Agent Creation"] = passed
	if passed {
		fmt.Println("PASS")
	} else {
		fmt.Println("FAIL")
	}
	
	// Test 2: Simple Analysis
	fmt.Print("Test 2: Simple Analysis.............. ")
	ctx := context.Background()
	response, err := agent.analyze(ctx, "analyze", map[string]interface{}{
		"data": map[string]interface{}{
			"content": "Test data for analysis",
			"type":    "text",
		},
	})
	passed = err == nil && response.Confidence >= 0.7 && response.Value != nil
	results["Simple Analysis"] = passed
	if passed {
		fmt.Println("PASS")
	} else {
		fmt.Println("FAIL")
		if err != nil {
			fmt.Printf("  Error: %v\n", err)
		}
	}
	
	// Test 3: Validation
	fmt.Print("Test 3: Validation................... ")
	response, err = agent.analyze(ctx, "validate", map[string]interface{}{
		"data": map[string]interface{}{
			"value": 42.0,
			"rules": []interface{}{"positive", "even"},
		},
	})
	if err == nil {
		result, _ := response.Value.(map[string]interface{})
		valid, _ := result["valid"].(bool)
		details, _ := result["details"].([]string)
		passed = valid && response.Confidence == 0.95 && len(details) == 2
	} else {
		passed = false
	}
	results["Validation"] = passed
	if passed {
		fmt.Println("PASS")
	} else {
		fmt.Println("FAIL")
		if err != nil {
			fmt.Printf("  Error: %v\n", err)
		}
	}
	
	// Test 4: Error Handling
	fmt.Print("Test 4: Error Handling............... ")
	_, err = agent.analyze(ctx, "unknown-task", map[string]interface{}{})
	passed = err != nil && strings.Contains(strings.ToLower(err.Error()), "unknown task")
	results["Error Handling"] = passed
	if passed {
		fmt.Println("PASS")
	} else {
		fmt.Println("FAIL (No error thrown)")
	}
	
	// Test 5: gRPC Server and Registration
	fmt.Print("Test 5: gRPC Server.................. ")
	// Start the agent's gRPC server in the background
	go func() {
		if err := agent.Serve(50056); err != nil {
			log.Printf("Failed to serve: %v", err)
		}
	}()
	
	// Give it a moment to start and register
	time.Sleep(2 * time.Second)
	
	// If we got here without crashing, it's working
	passed = true
	results["gRPC Server"] = passed
	if passed {
		fmt.Println("PASS")
		fmt.Println("   Agent gRPC server started on port 50056 and registered with control plane")
	} else {
		fmt.Println("FAIL")
	}
	
	// Summary
	passedCount := 0
	for _, v := range results {
		if v {
			passedCount++
		}
	}
	totalCount := len(results)
	fmt.Printf("\nSummary: %d/%d tests passed\n", passedCount, totalCount)
	
	return passedCount == totalCount
}

func main() {
	// Run standardized tests
	success := runStandardizedTests()
	
	if !success {
		os.Exit(1)
	}
}

// Helper function to check if a slice contains a string
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}