# Standalone Parallax Agent Examples

This directory contains examples of standalone Parallax agents that communicate via gRPC.

## Architecture

These agents demonstrate the correct Parallax architecture:
- Agents are standalone services (can be in any language)
- They communicate with the core platform via gRPC
- No Prism runtime in agents - only native language code
- The core platform handles all Prism pattern execution

## Running the Examples

### 1. Install Dependencies

```bash
cd examples/standalone-agent
pnpm install
pnpm build
```

### 2. Start the Sentiment Analysis Agent

```bash
# Run on auto-assigned port
pnpm dev

# Or specify a port
PORT=50051 pnpm dev
```

### 3. Start the Math Computation Agent

```bash
# In another terminal
tsx src/math-agent.ts
```

### 4. Use with Parallax

To use these agents with the Parallax platform:

#### Option 1: Local Development Mode

Set the environment variable when starting the control plane:

```bash
PARALLAX_LOCAL_AGENTS="sentiment-agent-1:Sentiment Analyzer:localhost:50051:analysis,text,sentiment;math-agent-1:Math Computation Agent:localhost:50052:analysis,computation,mathematics" pnpm dev
```

#### Option 2: Register with etcd

The agents will automatically register with the platform if etcd is running.

## Testing the Agents

### Test Pattern Execution

Create a test script:

```javascript
// test-agents.js
const result = await patternEngine.executePattern('consensus-builder', {
  task: 'Analyze the sentiment of this text',
  data: { text: 'This is a wonderful day! I love working with Parallax.' }
});

console.log(result);
```

### Direct gRPC Testing

You can also test agents directly using a gRPC client:

```javascript
const client = new ConfidenceAgentClient(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

const request = new AgentRequest();
request.setTaskDescription('analyze sentiment');
request.setData(Struct.fromJavaScript({ text: 'Great job!' }));

client.analyze(request, (err, response) => {
  if (err) {
    console.error(err);
  } else {
    console.log('Result:', JSON.parse(response.getValueJson()));
    console.log('Confidence:', response.getConfidence());
  }
});
```

## Creating Your Own Agent

1. Extend the `ParallaxAgent` class
2. Implement the `analyze` method
3. Return a tuple of `[result, confidence]`
4. Start the agent with `serveAgent()`

Example:

```typescript
class MyCustomAgent extends ParallaxAgent {
  constructor() {
    super(
      'my-agent-1',           // Unique ID
      'My Custom Agent',      // Display name
      ['capability1', 'capability2'], // Capabilities
      { expertise: 0.8 }      // Optional metadata
    );
  }

  async analyze(task: string, data?: any): Promise<[any, number]> {
    // Your analysis logic here
    const result = { /* ... */ };
    const confidence = 0.85;
    
    return [result, confidence];
  }
}
```

## Agent Capabilities

Agents declare capabilities that patterns use for selection:
- `analysis` - General analysis capability
- `text` - Text processing
- `sentiment` - Sentiment analysis
- `computation` - Mathematical computation
- `mathematics` - Math domain expertise

Patterns filter agents by these capabilities:

```prism
// In a .prism pattern file
agents = parallax.agents.filter(a => 
  a.capabilities.includes("sentiment")
)
```