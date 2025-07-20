package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/parallax/sdk-go/pkg/parallax"
)

// TestAgent implements the standardized test agent
type TestAgent struct {
	parallax.BaseAgent
}

// NewTestAgent creates a new test agent
func NewTestAgent() *TestAgent {
	return &TestAgent{
		BaseAgent: parallax.BaseAgent{
			ID:           "test-agent-go",
			Name:         "Test Agent (Go)",
			Capabilities: []string{"analysis", "validation"},
			Expertise:    0.85,
		},
	}
}

// Analyze implements the agent analyze method
func (a *TestAgent) Analyze(ctx context.Context, task string, input map[string]interface{}) (*parallax.AgentResponse, error) {
	switch task {
	case "analyze":
		data, _ := input["data"].(map[string]interface{})
		contentType := "unknown"
		if t, ok := data["type"].(string); ok {
			contentType = t
		}
		content := ""
		if c, ok := data["content"].(string); ok {
			content = c
		}

		return &parallax.AgentResponse{
			Value: map[string]interface{}{
				"summary": fmt.Sprintf("Analyzed %s content", contentType),
				"length":  len(content),
				"result":  "Analysis complete",
			},
			Confidence: 0.85,
			Reasoning:  "Standard analysis performed",
		}, nil

	case "validate":
		data, _ := input["data"].(map[string]interface{})
		value, _ := data["value"].(float64) // JSON numbers are float64
		rules, _ := data["rules"].([]interface{})
		
		details := []string{}
		valid := true

		for _, r := range rules {
			rule, _ := r.(string)
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

		return &parallax.AgentResponse{
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
	fmt.Println("SDK Version: 0.1.0\n")

	results := make(map[string]bool)

	// Test 1: Agent Creation
	func() {
		defer func() {
			if r := recover(); r != nil {
				results["Agent Creation"] = false
				fmt.Printf("Test 1: Agent Creation............... FAIL (%v)\n", r)
			}
		}()

		agent := NewTestAgent()
		passed := agent.ID == "test-agent-go" &&
			contains(agent.Capabilities, "analysis") &&
			contains(agent.Capabilities, "validation")
		results["Agent Creation"] = passed
		status := "PASS"
		if !passed {
			status = "FAIL"
		}
		fmt.Printf("Test 1: Agent Creation............... %s\n", status)
	}()

	// Test 2: Simple Analysis
	func() {
		defer func() {
			if r := recover(); r != nil {
				results["Simple Analysis"] = false
				fmt.Printf("Test 2: Simple Analysis.............. FAIL (%v)\n", r)
			}
		}()

		agent := NewTestAgent()
		response, err := agent.Analyze(context.Background(), "analyze", map[string]interface{}{
			"data": map[string]interface{}{
				"content": "Test data for analysis",
				"type":    "text",
			},
		})
		
		passed := err == nil && response.Confidence >= 0.7 && response.Value != nil
		results["Simple Analysis"] = passed
		status := "PASS"
		if !passed {
			status = "FAIL"
		}
		fmt.Printf("Test 2: Simple Analysis.............. %s\n", status)
	}()

	// Test 3: Validation
	func() {
		defer func() {
			if r := recover(); r != nil {
				results["Validation"] = false
				fmt.Printf("Test 3: Validation................... FAIL (%v)\n", r)
			}
		}()

		agent := NewTestAgent()
		response, err := agent.Analyze(context.Background(), "validate", map[string]interface{}{
			"data": map[string]interface{}{
				"value": 42.0,
				"rules": []interface{}{"positive", "even"},
			},
		})
		
		value := response.Value.(map[string]interface{})
		details := value["details"].([]string)
		passed := err == nil &&
			value["valid"].(bool) == true &&
			response.Confidence == 0.95 &&
			len(details) == 2
		results["Validation"] = passed
		status := "PASS"
		if !passed {
			status = "FAIL"
		}
		fmt.Printf("Test 3: Validation................... %s\n", status)
	}()

	// Test 4: Error Handling
	func() {
		defer func() {
			if r := recover(); r != nil {
				results["Error Handling"] = false
				fmt.Printf("Test 4: Error Handling............... FAIL (%v)\n", r)
			}
		}()

		agent := NewTestAgent()
		_, err := agent.Analyze(context.Background(), "unknown-task", map[string]interface{}{})
		
		if err == nil {
			results["Error Handling"] = false
			fmt.Println("Test 4: Error Handling............... FAIL (No error thrown)")
		} else {
			passed := strings.Contains(strings.ToLower(err.Error()), "unknown task")
			results["Error Handling"] = passed
			status := "PASS"
			if !passed {
				status = "FAIL"
			}
			fmt.Printf("Test 4: Error Handling............... %s\n", status)
		}
	}()

	// Test 5: Client API (optional)
	func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Println("Test 5: Client API (optional)........ SKIP (Control plane not running)")
			}
		}()

		client, err := parallax.NewClient(parallax.ClientConfig{
			BaseURL: "http://localhost:8080",
		})
		if err != nil {
			fmt.Println("Test 5: Client API (optional)........ SKIP (Control plane not running)")
			return
		}

		ctx := context.Background()
		
		// 5.1 Health Check
		health, err := client.Health(ctx)
		if err != nil {
			fmt.Println("Test 5: Client API (optional)........ SKIP (Control plane not running)")
			return
		}

		// 5.2 List Patterns
		patterns, err := client.ListPatterns(ctx)
		if err != nil {
			results["Client API"] = false
			fmt.Println("Test 5: Client API (optional)........ FAIL")
			return
		}

		// 5.3 Pattern Execution
		execution, err := client.ExecutePattern(ctx, "SimpleConsensus", map[string]interface{}{
			"task": "SDK test",
			"data": map[string]interface{}{"test": true},
		})

		passed := health != nil && len(patterns) > 0 && execution.ID != ""
		results["Client API"] = passed
		status := "PASS"
		if !passed {
			status = "FAIL"
		}
		fmt.Printf("Test 5: Client API (optional)........ %s\n", status)
	}()

	// Summary
	passed := 0
	for _, v := range results {
		if v {
			passed++
		}
	}
	total := len(results)
	fmt.Printf("\nSummary: %d/%d tests passed\n", passed, total)

	return passed == total
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

func main() {
	success := runStandardizedTests()
	if !success {
		os.Exit(1)
	}
}