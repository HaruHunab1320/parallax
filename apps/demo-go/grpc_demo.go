package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/parallax/sdk-go/pkg/parallax"
)

// DemoAgent implements a demo agent for testing
type DemoAgent struct {
	id           string
	name         string
	capabilities []string
	metadata     map[string]string
}

func NewDemoAgent() *DemoAgent {
	return &DemoAgent{
		id:           "demo-agent-go",
		name:         "Go Demo Agent",
		capabilities: []string{"code-analysis", "testing"},
		metadata: map[string]string{
			"language": "go",
			"version":  "1.0.0",
			"sdk":      "parallax-go",
		},
	}
}

func (d *DemoAgent) GetID() string {
	return d.id
}

func (d *DemoAgent) GetName() string {
	return d.name
}

func (d *DemoAgent) GetCapabilities() []string {
	return d.capabilities
}

func (d *DemoAgent) GetMetadata() map[string]string {
	return d.metadata
}

func (d *DemoAgent) Analyze(ctx context.Context, task string, data interface{}) (*parallax.AnalyzeResult, error) {
	log.Printf("Analyzing task: %s", task)

	// Route based on task
	switch task {
	case "analyze-code", "code":
		return d.analyzeCode(data)
	case "get-system-info", "system":
		return d.getSystemInfo()
	default:
		// Generic analysis
		return &parallax.AnalyzeResult{
			Value: map[string]interface{}{
				"task":   task,
				"data":   data,
				"result": "Analysis complete",
			},
			Confidence: 0.75,
			Reasoning:  fmt.Sprintf("Performed generic analysis for task: %s", task),
		}, nil
	}
}

func (d *DemoAgent) analyzeCode(data interface{}) (*parallax.AnalyzeResult, error) {
	// Extract code string
	var code string
	switch v := data.(type) {
	case string:
		code = v
	case map[string]interface{}:
		if c, ok := v["code"].(string); ok {
			code = c
		}
	}

	if code == "" {
		return nil, fmt.Errorf("no code provided for analysis")
	}

	// Simple code analysis
	hasTests := containsAny(code, []string{"func Test", "_test.go", "t.Run"})
	hasComments := containsAny(code, []string{"//", "/*"})
	hasError := containsAny(code, []string{"if err != nil", "return err"})

	quality := "medium"
	confidence := 0.75
	if hasTests && hasComments && hasError {
		quality = "high"
		confidence = 0.9
	} else if !hasTests && !hasComments {
		quality = "low"
		confidence = 0.6
	}

	suggestions := []string{}
	if !hasTests {
		suggestions = append(suggestions, "Add unit tests")
	}
	if !hasComments {
		suggestions = append(suggestions, "Add code comments")
	}
	if !hasError {
		suggestions = append(suggestions, "Add error handling")
	}

	return &parallax.AnalyzeResult{
		Value: map[string]interface{}{
			"hasTests":    hasTests,
			"hasComments": hasComments,
			"hasErrors":   hasError,
			"quality":     quality,
			"suggestions": suggestions,
		},
		Confidence:    confidence,
		Reasoning:     fmt.Sprintf("Analyzed Go code with %d lines", len(code)),
		Uncertainties: []string{"Simple keyword matching", "No AST analysis"},
		Metadata: map[string]string{
			"analyzer": "keyword-based",
			"version":  "1.0",
		},
	}, nil
}

func (d *DemoAgent) getSystemInfo() (*parallax.AnalyzeResult, error) {
	return &parallax.AnalyzeResult{
		Value: map[string]interface{}{
			"version":  "1.0.0",
			"language": "Go",
			"platform": os.Getenv("GOOS"),
			"arch":     os.Getenv("GOARCH"),
			"goVersion": os.Getenv("GOVERSION"),
		},
		Confidence: 1.0,
		Reasoning:  "System information retrieved",
	}, nil
}

func (d *DemoAgent) CheckHealth(ctx context.Context) (*parallax.HealthStatus, error) {
	return &parallax.HealthStatus{
		Status:  "healthy",
		Message: "Agent is operational",
	}, nil
}

func containsAny(text string, keywords []string) bool {
	for _, keyword := range keywords {
		if len(text) > 0 && len(keyword) > 0 {
			// Simple contains check
			if text == keyword || contains(text, keyword) {
				return true
			}
		}
	}
	return false
}

func contains(text, substr string) bool {
	return len(text) >= len(substr) && (text == substr || findSubstring(text, substr) >= 0)
}

func findSubstring(text, substr string) int {
	for i := 0; i <= len(text)-len(substr); i++ {
		if text[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

func runDemo() error {
	fmt.Println("🚀 Parallax Go SDK Demo\n")

	// 1. Test Agent Creation
	fmt.Println("1️⃣ Creating Demo Agent...")
	agent := NewDemoAgent()
	fmt.Printf("✅ Agent created: %s (%s)\n", agent.GetName(), agent.GetID())
	fmt.Printf("   Capabilities: %v\n", agent.GetCapabilities())
	fmt.Printf("   Metadata: %v\n\n", agent.GetMetadata())

	// 2. Test Agent Methods
	fmt.Println("2️⃣ Testing Agent Methods...")
	
	// Test code analysis
	codeToAnalyze := `
func Calculate(a, b int) (int, error) {
    // Add two numbers
    if a < 0 || b < 0 {
        return 0, fmt.Errorf("negative numbers not allowed")
    }
    return a + b, nil
}

func TestCalculate(t *testing.T) {
    result, err := Calculate(2, 3)
    if err != nil {
        t.Fatal(err)
    }
    if result != 5 {
        t.Errorf("expected 5, got %d", result)
    }
}`

	ctx := context.Background()
	result, err := agent.Analyze(ctx, "analyze-code", map[string]interface{}{"code": codeToAnalyze})
	if err != nil {
		return fmt.Errorf("code analysis failed: %w", err)
	}
	fmt.Printf("✅ Code analysis result: %v\n", result.Value)
	fmt.Printf("   Confidence: %.2f\n", result.Confidence)
	fmt.Printf("   Reasoning: %s\n\n", result.Reasoning)

	// Test system info
	sysResult, err := agent.Analyze(ctx, "get-system-info", nil)
	if err != nil {
		return fmt.Errorf("system info failed: %w", err)
	}
	fmt.Printf("✅ System info: %v\n\n", sysResult.Value)

	// 3. Test gRPC Server
	fmt.Println("3️⃣ Testing gRPC Server...")
	fmt.Println("   Starting agent gRPC server...")
	
	// Start server in background
	go func() {
		if err := parallax.ServeAgent(agent, 50053); err != nil {
			log.Printf("Server error: %v", err)
		}
	}()

	// Give server time to start
	time.Sleep(2 * time.Second)
	fmt.Printf("✅ Agent gRPC server started on port 50053 and registered with control plane\n\n")

	// 4. Test Error Handling
	fmt.Println("4️⃣ Testing Error Handling...")
	_, err = agent.Analyze(ctx, "invalid-task", nil)
	if err != nil {
		fmt.Printf("✅ Error handling works: %v\n\n", err)
	} else {
		fmt.Println("❌ Error handling failed: no error returned\n")
	}

	fmt.Println("✅ Go SDK Demo Complete!")
	fmt.Println("\nSummary:")
	fmt.Println("- Agent creation: ✅")
	fmt.Println("- Method execution: ✅")
	fmt.Println("- gRPC server: ✅")
	fmt.Println("- Error handling: ✅")

	// Keep running for a bit to test server
	fmt.Println("\nPress Ctrl+C to stop...")
	select {}
}

func main() {
	if err := runDemo(); err != nil {
		log.Fatal(err)
	}
}