# Parallax Python SDK

Build AI agents in Python that integrate with the Parallax orchestration platform.

## Installation

```bash
pip install parallax
```

Or with Poetry:
```bash
poetry add parallax
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

### 2. Using Decorators

```python
from parallax import ParallaxAgent
from parallax.decorators import (
    confidence_threshold,
    requires_data,
    with_reasoning,
    cached
)

class AdvancedAgent(ParallaxAgent):
    def __init__(self):
        super().__init__(
            "advanced-1",
            "Advanced Analyzer",
            ["analysis", "ml"]
        )
    
    @confidence_threshold(min_confidence=0.3)
    @requires_data("input_data")
    @with_reasoning
    @cached(ttl_seconds=300)
    async def analyze(self, task: str, data: dict = None) -> tuple[dict, float]:
        # Complex analysis
        result = await self.ml_model.predict(data["input_data"])
        
        return {
            "prediction": result,
            "model": "v2.1"
        }, 0.92
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
from parallax.decorators import with_uncertainty_tracking

@with_uncertainty_tracking
async def analyze(self, task: str, data: dict = None) -> tuple[dict, float]:
    result = await self.process(data)
    
    if data.get("missing_context"):
        self._uncertainties.append("Missing important context")
    
    if not self.recent_training:
        self._uncertainties.append("Model not recently updated")
    
    return result, 0.7
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
- `shutdown(grace_period: float)` - Graceful shutdown

### Decorators

- `@capability(*capabilities)` - Declare method capabilities
- `@confidence_threshold(min, max)` - Validate confidence bounds
- `@requires_data(*fields)` - Validate required fields
- `@with_reasoning` - Ensure reasoning in result
- `@with_uncertainty_tracking` - Track uncertainties
- `@cached(ttl_seconds)` - Cache results

### Types

- `AgentResult` - Structured result type
- `Capabilities` - Agent capabilities
- `HealthStatus` - Health check result
- `AnalyzeResult` - Type alias for (result, confidence)

## Examples

See `/examples/python-agent/` for complete examples:
- `weather_agent.py` - Weather analysis with uncertainty
- More examples coming soon!

## Contributing

See main Parallax contributing guide.

## License

Same as Parallax platform.