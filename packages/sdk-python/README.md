# Parallax Python SDK

Build AI agents in Python that integrate with the Parallax orchestration platform.

## Installation

```bash
pip install parallaxai
```

Or with Poetry:
```bash
poetry add parallaxai
```

## Quick Start

### 1. Create an Agent

```python
from parallax import ParallaxAgent, run_agent

class SentimentAgent(ParallaxAgent):
    def __init__(self):
        super().__init__(
            agent_id="sentiment-1",
            name="Sentiment Analyzer",
            capabilities=["sentiment", "text", "analysis"]
        )
    
    async def analyze(self, task: str, data: dict = None) -> tuple[dict, float]:
        text = data.get("text", task)
        
        # Your analysis logic here
        if "happy" in text.lower() or "good" in text.lower():
            sentiment = "positive"
            confidence = 0.85
        elif "sad" in text.lower() or "bad" in text.lower():
            sentiment = "negative"
            confidence = 0.85
        else:
            sentiment = "neutral"
            confidence = 0.6
        
        return {
            "sentiment": sentiment,
            "text": text
        }, confidence

# Run the agent
if __name__ == "__main__":
    agent = SentimentAgent()
    run_agent(agent)
```

### 2. Agent with Validation

```python
from parallax import ParallaxAgent

class AdvancedAgent(ParallaxAgent):
    def __init__(self):
        super().__init__(
            "advanced-1",
            "Advanced Analyzer",
            ["analysis", "ml"]
        )
    
    async def analyze(self, task: str, data: dict = None) -> tuple[dict, float]:
        # Validate input data
        if not data or "input_data" not in data:
            return {"error": "Missing required input_data"}, 0.0
        
        # Complex analysis
        result = await self.ml_model.predict(data["input_data"])
        confidence = 0.92
        
        # Ensure confidence is within bounds
        confidence = max(0.3, min(1.0, confidence))
        
        return {
            "prediction": result,
            "model": "v2.1",
            "reasoning": f"Analysis completed with confidence {confidence:.2f}"
        }, confidence
```

### 3. Async Server

```python
import asyncio
from parallax import ParallaxAgent, serve_agent

async def main():
    agent = MyAgent()
    
    # Start on specific port
    port = await serve_agent(agent, port=50052)
    print(f"Agent running on port {port}")
    
    # Keep running
    await agent.wait_for_termination()

asyncio.run(main())
```

## Features

### Confidence Handling

Every agent must return a confidence score (0.0 to 1.0):

```python
async def analyze(self, task: str, data: dict = None) -> tuple[Any, float]:
    if self.is_certain(data):
        return {"result": "certain"}, 0.95
    else:
        return {"result": "uncertain"}, 0.4
```

### Health Checks

Implement custom health checks:

```python
async def check_health(self) -> HealthStatus:
    if self.model_loaded and self.database_connected:
        return HealthStatus("healthy", "All systems operational")
    else:
        return HealthStatus("degraded", "Some services unavailable")
```

### Capability Scores

Provide detailed capability information:

```python
def __init__(self):
    super().__init__(
        "expert-1",
        "Domain Expert",
        ["nlp", "classification"],
        metadata={
            "expertise": 0.9,
            "capability_scores": {
                "nlp": 0.95,
                "classification": 0.85,
                "generation": 0.7
            }
        }
    )
```

### Uncertainty Tracking

Track and report uncertainties:

```python
async def analyze(self, task: str, data: dict = None) -> tuple[dict, float]:
    result = await self.process(data)
    uncertainties = []
    
    if data.get("missing_context"):
        uncertainties.append("Missing important context")
    
    if not self.recent_training:
        uncertainties.append("Model not recently updated")
    
    if uncertainties:
        result["uncertainties"] = uncertainties
    
    return result, 0.7
```

## Gateway Connection (NAT Traversal)

For agents behind NAT or firewalls, use gateway mode instead of `serve()`. The agent opens an outbound connection to the control plane, which sends tasks back through the stream.

```python
import asyncio
from parallax import ParallaxAgent, GatewayOptions

class MyAgent(ParallaxAgent):
    def __init__(self):
        super().__init__("edge-1", "Edge Agent", ["analysis"])

    async def analyze(self, task, data=None):
        return {"result": "processed"}, 0.85

async def main():
    agent = MyAgent()

    # Connect via gateway (no public endpoint needed)
    await agent.connect_via_gateway("control-plane:8081")

    # Or with custom options
    await agent.connect_via_gateway(
        "control-plane:8081",
        GatewayOptions(
            heartbeat_interval_ms=5000,
            auto_reconnect=True,
            max_reconnect_attempts=10,
        )
    )

asyncio.run(main())
```

## Pattern & Execution Clients

Use the gRPC clients to interact with the control plane directly:

```python
from parallax import PatternClient, ExecutionClient

# Execute patterns
patterns = PatternClient("localhost:8080")
result = await patterns.execute("consensus-builder", {"task": "analyze"})
await patterns.close()

# Track executions
executions = ExecutionClient("localhost:8080")
status = await executions.get("exec-123")

# Stream execution events
async for event in executions.stream_events("exec-123"):
    print(f"Event: {event}")
await executions.close()
```

## Running with Parallax

### Local Development

Set the environment variable when starting the control plane:

```bash
PARALLAX_LOCAL_AGENTS="agent1:My Agent:localhost:50052:capability1,capability2"
```

### Production

Agents will auto-register with the platform via etcd.

## Advanced Usage

### Custom gRPC Options

```python
agent = MyAgent()
await agent.serve(
    port=50052,
    max_workers=20,  # Increase worker threads
)
```

### Batch Processing

```python
class BatchAgent(ParallaxAgent):
    async def analyze(self, task: str, data: dict = None) -> tuple[dict, float]:
        if isinstance(data.get("items"), list):
            results = []
            total_confidence = 0
            
            for item in data["items"]:
                result, conf = await self.process_item(item)
                results.append(result)
                total_confidence += conf
            
            return {
                "batch_results": results,
                "count": len(results)
            }, total_confidence / len(results)
```

### Integration with ML Libraries

```python
import torch
from transformers import pipeline

class MLAgent(ParallaxAgent):
    def __init__(self):
        super().__init__("ml-1", "ML Agent", ["ml", "nlp"])
        self.model = pipeline("sentiment-analysis")
    
    async def analyze(self, task: str, data: dict = None) -> tuple[dict, float]:
        text = data.get("text", "")
        
        # Run model
        results = self.model(text)
        
        # Extract confidence from model
        model_confidence = results[0]["score"]
        
        return {
            "label": results[0]["label"],
            "model_confidence": model_confidence
        }, model_confidence * 0.95  # Slightly reduce confidence
```

## Testing

```python
import pytest
from parallax.testing import MockParallaxAgent

@pytest.mark.asyncio
async def test_my_agent():
    agent = MyAgent()
    
    result, confidence = await agent.analyze(
        "test task",
        {"data": "test"}
    )
    
    assert confidence > 0.5
    assert "result" in result
```

## API Reference

### ParallaxAgent

Base class for all agents.

**Methods:**
- `analyze(task: str, data: Any) -> Tuple[Any, float]` - Main analysis method
- `check_health() -> HealthStatus` - Health check
- `get_capabilities() -> Capabilities` - Get capabilities
- `serve(port: int) -> int` - Start gRPC server
- `connect_via_gateway(endpoint, options)` - Connect via gateway (NAT traversal)
- `shutdown(grace_period: float)` - Graceful shutdown

### PatternClient

gRPC client for pattern operations.

- `list(tags, include_scripts)` - List available patterns
- `get(name, version)` - Get pattern by name
- `execute(pattern_name, input_data, options)` - Execute a pattern
- `upload(pattern, overwrite)` - Upload a pattern
- `close()` - Close the gRPC channel

### ExecutionClient

gRPC client for execution tracking.

- `get(execution_id)` - Get execution status
- `list(limit, offset, status)` - List executions
- `stream_events(execution_id)` - Async iterator of execution events
- `close()` - Close the gRPC channel

### Response Format

Agents should return a tuple of (result, confidence):

```python
async def analyze(self, task: str, data: dict = None) -> tuple[dict, float]:
    return {
        "value": "analysis result",
        "reasoning": "Explanation of the analysis",
        "uncertainties": ["List of uncertainties if any"]
    }, 0.85  # Confidence score 0.0-1.0
```

### Types

- `AgentResult` - Structured result type
- `Capabilities` - Agent capabilities
- `HealthStatus` - Health check result
- `AnalyzeResult` - Type alias for (result, confidence)
- `GatewayOptions` - Gateway connection configuration

## Examples

See `/examples/python-agent/` for complete examples:
- `weather_agent.py` - Weather analysis with uncertainty
- More examples coming soon!

## Contributing

See main Parallax contributing guide.

## License

Same as Parallax platform.