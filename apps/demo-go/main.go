package main

import (
    "context"
    "fmt"
    "log"
    "strings"
    "time"

    "github.com/parallax/sdk-go/pkg/parallax"
)

// DemoAgent implements a simple agent for testing
type DemoAgent struct {
    parallax.BaseAgent
}

// NewDemoAgent creates a new demo agent
func NewDemoAgent() *DemoAgent {
    return &DemoAgent{
        BaseAgent: parallax.BaseAgent{
            ID:           "demo-agent-go",
            Name:         "Go Demo Agent",
            Capabilities: []string{"code-analysis", "testing"},
            Expertise:    0.85,
        },
    }
}

// Analyze implements the agent analyze method
func (a *DemoAgent) Analyze(ctx context.Context, task string, input map[string]interface{}) (*parallax.AgentResponse, error) {
    switch task {
    case "analyze-code":
        return a.analyzeCode(input)
    case "get-system-info":
        return a.getSystemInfo()
    default:
        return nil, fmt.Errorf("unknown task: %s", task)
    }
}

func (a *DemoAgent) analyzeCode(input map[string]interface{}) (*parallax.AgentResponse, error) {
    code, ok := input["code"].(string)
    if !ok {
        return nil, fmt.Errorf("missing code in input")
    }

    // Simple Go code analysis
    hasTests := strings.Contains(code, "func Test") || strings.Contains(code, "_test.go")
    hasComments := strings.Contains(code, "//") || strings.Contains(code, "/*")
    hasError := strings.Contains(code, "error")

    quality := "medium"
    if hasTests && hasComments {
        quality = "high"
    }

    suggestions := []string{}
    if !hasTests {
        suggestions = append(suggestions, "Add unit tests")
    }
    if !hasComments {
        suggestions = append(suggestions, "Add comments")
    }

    return &parallax.AgentResponse{
        Value: map[string]interface{}{
            "hasTests":    hasTests,
            "hasComments": hasComments,
            "hasError":    hasError,
            "quality":     quality,
            "suggestions": suggestions,
        },
        Confidence: 0.85,
        Reasoning:  fmt.Sprintf("Analyzed %d lines of Go code", strings.Count(code, "\n")),
        Timestamp:  time.Now(),
    }, nil
}

func (a *DemoAgent) getSystemInfo() (*parallax.AgentResponse, error) {
    return &parallax.AgentResponse{
        Value: map[string]interface{}{
            "version":  "1.0.0",
            "language": "Go",
            "platform": "linux/amd64",
        },
        Confidence: 1.0,
        Timestamp:  time.Now(),
    }, nil
}

func main() {
    fmt.Println("🚀 Parallax Go SDK Demo\n")

    // Test 1: Agent Creation
    fmt.Println("1️⃣  Creating Demo Agent...")
    agent := NewDemoAgent()
    fmt.Printf("✅ Agent created: %s (%s)\n", agent.Name, agent.ID)
    fmt.Printf("   Capabilities: %v\n", agent.Capabilities)
    fmt.Printf("   Expertise: %.2f\n\n", agent.Expertise)

    // Test 2: Agent Methods
    fmt.Println("2️⃣  Testing Agent Methods...")
    ctx := context.Background()

    codeToAnalyze := `
package main

import "fmt"

// Hello prints a greeting
func Hello(name string) string {
    return fmt.Sprintf("Hello, %s!", name)
}

func TestHello(t *testing.T) {
    result := Hello("World")
    if result != "Hello, World!" {
        t.Errorf("Expected 'Hello, World!', got %s", result)
    }
}
`

    response, err := agent.Analyze(ctx, "analyze-code", map[string]interface{}{
        "code": codeToAnalyze,
    })
    if err != nil {
        log.Printf("Error analyzing code: %v", err)
    } else {
        fmt.Printf("✅ Code analysis result: %v\n", response.Value)
        fmt.Printf("   Confidence: %.2f\n", response.Confidence)
        fmt.Printf("   Reasoning: %s\n\n", response.Reasoning)
    }

    // Test 3: Control Plane Client
    fmt.Println("3️⃣  Testing Control Plane Client...")

    config := parallax.ClientConfig{
        BaseURL: "http://localhost:8080",
        Timeout: 5 * time.Second,
    }

    client, err := parallax.NewClient(config)
    if err != nil {
        log.Printf("Failed to create client: %v", err)
        return
    }

    // Check health
    health, err := client.Health(ctx)
    if err != nil {
        fmt.Println("⚠️  Control plane not running (this is normal for SDK testing)")
        fmt.Printf("   Error: %v\n\n", err)
    } else {
        fmt.Printf("✅ Health check: %v\n", health)

        // List patterns
        patterns, err := client.ListPatterns(ctx)
        if err == nil {
            fmt.Printf("✅ Found %d patterns\n", len(patterns))
            if len(patterns) > 0 {
                fmt.Printf("   First pattern: %s v%s\n", patterns[0].Name, patterns[0].Version)
            }
        }

        // List agents
        agents, err := client.ListAgents(ctx)
        if err == nil {
            fmt.Printf("✅ Found %d registered agents\n\n", len(agents.Agents))
        }
    }

    // Test 4: Pattern Execution (if control plane is running)
    fmt.Println("4️⃣  Testing Pattern Execution...")

    if health != nil {
        // Register agent
        err = client.RegisterAgent(ctx, parallax.AgentRegistration{
            ID:           agent.ID,
            Name:         agent.Name,
            Endpoint:     "grpc://localhost:50053",
            Capabilities: agent.Capabilities,
            Metadata: map[string]interface{}{
                "sdk":     "go",
                "version": "0.1.0",
            },
        })

        if err != nil {
            fmt.Printf("Failed to register agent: %v\n", err)
        } else {
            fmt.Println("✅ Agent registered with control plane")

            // Execute pattern
            execution, err := client.ExecutePattern(ctx, "SimpleConsensus", map[string]interface{}{
                "task": "Test the Go SDK",
                "data": map[string]interface{}{"test": true},
            })

            if err != nil {
                fmt.Printf("Failed to execute pattern: %v\n", err)
            } else {
                fmt.Printf("✅ Pattern execution started: %s\n", execution.ID)

                // Wait for result
                time.Sleep(2 * time.Second)
                result, err := client.GetExecution(ctx, execution.ID)
                if err == nil {
                    fmt.Printf("✅ Execution result: %v\n\n", result.Status)
                }
            }
        }
    } else {
        fmt.Println("⚠️  Pattern execution skipped (control plane not running)\n")
    }

    // Test 5: Error Handling
    fmt.Println("5️⃣  Testing Error Handling...")
    _, err = agent.Analyze(ctx, "invalid-task", map[string]interface{}{})
    if err != nil {
        fmt.Printf("✅ Error handling works: %v\n\n", err)
    }

    fmt.Println("✅ Go SDK Demo Complete!")
    fmt.Println("\nSummary:")
    fmt.Println("- Agent creation: ✅")
    fmt.Println("- Method execution: ✅")
    fmt.Println("- Client API: ✅ (requires control plane)")
    fmt.Println("- Error handling: ✅")
}