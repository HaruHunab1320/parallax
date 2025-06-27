"""Tests for Parallax Python SDK decorators."""

import pytest
import asyncio
from unittest.mock import Mock, patch
import time
import json

from parallax import ParallaxAgent
from parallax.decorators import (
    confidence_threshold,
    requires_data,
    with_reasoning,
    with_uncertainty_tracking,
    cached,
    capability
)


class TestConfidenceThreshold:
    """Test confidence threshold decorator."""
    
    @pytest.mark.asyncio
    async def test_confidence_within_bounds(self):
        """Test confidence stays within specified bounds."""
        class TestAgent(ParallaxAgent):
            def __init__(self):
                super().__init__("test-1", "Test", [])
            
            @confidence_threshold(min_confidence=0.3, max_confidence=0.9)
            async def analyze(self, task, data=None):
                if task == "low":
                    return {"result": "low"}, 0.1  # Below min
                elif task == "high":
                    return {"result": "high"}, 0.99  # Above max
                else:
                    return {"result": "normal"}, 0.7
        
        agent = TestAgent()
        
        # Test below minimum
        result, conf = await agent.analyze("low")
        assert conf == 0.3  # Adjusted to minimum
        
        # Test above maximum
        result, conf = await agent.analyze("high")
        assert conf == 0.9  # Adjusted to maximum
        
        # Test within bounds
        result, conf = await agent.analyze("normal")
        assert conf == 0.7  # Unchanged


class TestRequiresData:
    """Test requires_data decorator."""
    
    @pytest.mark.asyncio
    async def test_missing_required_fields(self):
        """Test handling of missing required fields."""
        class TestAgent(ParallaxAgent):
            def __init__(self):
                super().__init__("test-1", "Test", [])
            
            @requires_data("text", "language")
            async def analyze(self, task, data=None):
                return {"processed": data["text"]}, 0.9
        
        agent = TestAgent()
        
        # Test with no data
        result, conf = await agent.analyze("test", None)
        assert result["error"] == "No data provided"
        assert conf == 0.0
        
        # Test with missing field
        result, conf = await agent.analyze("test", {"text": "hello"})
        assert result["error"] == "Missing required fields"
        assert "language" in result["missing_fields"]
        assert conf == 0.0
        
        # Test with all fields
        result, conf = await agent.analyze("test", {"text": "hello", "language": "en"})
        assert result["processed"] == "hello"
        assert conf == 0.9
    
    @pytest.mark.asyncio
    async def test_non_dict_data(self):
        """Test handling of non-dictionary data."""
        class TestAgent(ParallaxAgent):
            def __init__(self):
                super().__init__("test-1", "Test", [])
            
            @requires_data("field")
            async def analyze(self, task, data=None):
                return {"result": "ok"}, 0.9
        
        agent = TestAgent()
        
        result, conf = await agent.analyze("test", "string_data")
        assert result["error"] == "Data must be a dictionary"
        assert conf == 0.0


class TestWithReasoning:
    """Test with_reasoning decorator."""
    
    @pytest.mark.asyncio
    async def test_adds_reasoning(self):
        """Test that reasoning is added to results."""
        class TestAgent(ParallaxAgent):
            def __init__(self):
                super().__init__("test-1", "Test Agent", [])
            
            @with_reasoning
            async def analyze(self, task, data=None):
                return {"answer": 42}, 0.85
        
        agent = TestAgent()
        result, conf = await agent.analyze("test")
        
        assert "reasoning" in result
        assert "Test Agent" in result["reasoning"]
        assert "0.85" in result["reasoning"]
        assert result["answer"] == 42
    
    @pytest.mark.asyncio
    async def test_preserves_existing_reasoning(self):
        """Test that existing reasoning is preserved."""
        class TestAgent(ParallaxAgent):
            def __init__(self):
                super().__init__("test-1", "Test", [])
            
            @with_reasoning
            async def analyze(self, task, data=None):
                return {
                    "answer": 42,
                    "reasoning": "Custom reasoning"
                }, 0.85
        
        agent = TestAgent()
        result, conf = await agent.analyze("test")
        
        assert result["reasoning"] == "Custom reasoning"


class TestWithUncertaintyTracking:
    """Test with_uncertainty_tracking decorator."""
    
    @pytest.mark.asyncio
    async def test_tracks_uncertainties(self):
        """Test that uncertainties are tracked and added to result."""
        class TestAgent(ParallaxAgent):
            def __init__(self):
                super().__init__("test-1", "Test", [])
            
            @with_uncertainty_tracking
            async def analyze(self, task, data=None):
                if task == "uncertain":
                    self._uncertainties.append("Missing context")
                    self._uncertainties.append("Limited data")
                    return {"result": "uncertain"}, 0.6
                else:
                    return {"result": "certain"}, 0.95
        
        agent = TestAgent()
        
        # Test with uncertainties
        result, conf = await agent.analyze("uncertain")
        assert "uncertainties" in result
        assert len(result["uncertainties"]) == 2
        assert "Missing context" in result["uncertainties"]
        
        # Test without uncertainties
        result, conf = await agent.analyze("certain")
        assert "uncertainties" not in result


class TestCached:
    """Test cached decorator."""
    
    @pytest.mark.asyncio
    async def test_caches_results(self):
        """Test that results are cached."""
        call_count = 0
        
        class TestAgent(ParallaxAgent):
            def __init__(self):
                super().__init__("test-1", "Test", [])
            
            @cached(ttl_seconds=1)
            async def analyze(self, task, data=None):
                nonlocal call_count
                call_count += 1
                return {"count": call_count}, 0.9
        
        agent = TestAgent()
        
        # First call
        result1, _ = await agent.analyze("test", {"data": "same"})
        assert result1["count"] == 1
        
        # Second call (should be cached)
        result2, _ = await agent.analyze("test", {"data": "same"})
        assert result2["count"] == 1  # Same as first
        
        # Different input (not cached)
        result3, _ = await agent.analyze("test", {"data": "different"})
        assert result3["count"] == 2
        
        # Wait for cache to expire
        time.sleep(1.1)
        
        # Should call function again
        result4, _ = await agent.analyze("test", {"data": "same"})
        assert result4["count"] == 3


class TestCapability:
    """Test capability decorator."""
    
    def test_adds_capabilities_to_method(self):
        """Test that capabilities are added to method."""
        class TestAgent(ParallaxAgent):
            def __init__(self):
                super().__init__("test-1", "Test", [])
            
            @capability("sentiment", "emotion")
            async def analyze_sentiment(self, text):
                return {"sentiment": "positive"}, 0.9
            
            @capability("translation")
            async def translate(self, text, target_lang):
                return {"translated": text}, 0.85
        
        agent = TestAgent()
        
        # Check capabilities are attached to methods
        assert hasattr(agent.analyze_sentiment, '_capabilities')
        assert "sentiment" in agent.analyze_sentiment._capabilities
        assert "emotion" in agent.analyze_sentiment._capabilities
        
        assert hasattr(agent.translate, '_capabilities')
        assert "translation" in agent.translate._capabilities