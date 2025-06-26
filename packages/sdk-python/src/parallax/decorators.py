"""Decorators for Parallax Python agents."""

import functools
import logging
from typing import Any, Callable, List, Optional, Union

from .types import AnalyzeResult

logger = logging.getLogger(__name__)


def capability(*capabilities: str):
    """Decorator to add capabilities to an agent method.
    
    Args:
        *capabilities: Capability names this method provides
        
    Example:
        @capability("sentiment", "emotion")
        async def analyze_sentiment(self, text):
            ...
    """
    def decorator(func):
        if not hasattr(func, '_capabilities'):
            func._capabilities = []
        func._capabilities.extend(capabilities)
        return func
    return decorator


def confidence_threshold(min_confidence: float = 0.0, max_confidence: float = 1.0):
    """Decorator to validate confidence scores.
    
    Args:
        min_confidence: Minimum acceptable confidence
        max_confidence: Maximum acceptable confidence
        
    Example:
        @confidence_threshold(min_confidence=0.3)
        async def analyze(self, task, data):
            ...
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(self, *args, **kwargs) -> AnalyzeResult:
            result, confidence = await func(self, *args, **kwargs)
            
            # Validate confidence
            if confidence < min_confidence:
                logger.warning(
                    f"Confidence {confidence} below minimum {min_confidence}, "
                    f"adjusting to {min_confidence}"
                )
                confidence = min_confidence
            elif confidence > max_confidence:
                logger.warning(
                    f"Confidence {confidence} above maximum {max_confidence}, "
                    f"adjusting to {max_confidence}"
                )
                confidence = max_confidence
            
            return result, confidence
        
        return wrapper
    return decorator


def requires_data(*required_fields: str):
    """Decorator to validate required data fields.
    
    Args:
        *required_fields: Field names that must be present in data
        
    Example:
        @requires_data("text", "language")
        async def analyze(self, task, data):
            ...
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(self, task: str, data: Optional[Any] = None) -> AnalyzeResult:
            # Check if data exists
            if data is None:
                return {
                    "error": "No data provided",
                    "required_fields": list(required_fields)
                }, 0.0
            
            # Check required fields
            missing_fields = []
            for field in required_fields:
                if isinstance(data, dict) and field not in data:
                    missing_fields.append(field)
                elif not isinstance(data, dict):
                    return {
                        "error": "Data must be a dictionary",
                        "required_fields": list(required_fields)
                    }, 0.0
            
            if missing_fields:
                return {
                    "error": "Missing required fields",
                    "missing_fields": missing_fields,
                    "required_fields": list(required_fields)
                }, 0.0
            
            return await func(self, task, data)
        
        return wrapper
    return decorator


def with_reasoning(func):
    """Decorator to ensure result includes reasoning.
    
    Example:
        @with_reasoning
        async def analyze(self, task, data):
            return {"answer": 42}, 0.9
            # Will be transformed to include reasoning
    """
    @functools.wraps(func)
    async def wrapper(self, *args, **kwargs) -> AnalyzeResult:
        result, confidence = await func(self, *args, **kwargs)
        
        # Ensure result is a dict
        if not isinstance(result, dict):
            result = {"value": result}
        
        # Add reasoning if not present
        if "reasoning" not in result:
            result["reasoning"] = (
                f"Analysis completed by {self.name} "
                f"with confidence {confidence:.2f}"
            )
        
        return result, confidence
    
    return wrapper


def with_uncertainty_tracking(func):
    """Decorator to track uncertainties during analysis.
    
    Example:
        @with_uncertainty_tracking
        async def analyze(self, task, data):
            # Access self._uncertainties list during analysis
            if some_condition:
                self._uncertainties.append("Missing historical data")
            return result, confidence
    """
    @functools.wraps(func)
    async def wrapper(self, *args, **kwargs) -> AnalyzeResult:
        # Initialize uncertainty list
        self._uncertainties = []
        
        # Call the function
        result, confidence = await func(self, *args, **kwargs)
        
        # Add uncertainties to result if any were tracked
        if self._uncertainties:
            if isinstance(result, dict):
                result["uncertainties"] = self._uncertainties
            else:
                result = {
                    "value": result,
                    "uncertainties": self._uncertainties
                }
        
        # Clean up
        delattr(self, '_uncertainties')
        
        return result, confidence
    
    return wrapper


def cached(ttl_seconds: int = 300):
    """Decorator to cache analysis results.
    
    Args:
        ttl_seconds: Time to live for cache entries
        
    Example:
        @cached(ttl_seconds=600)
        async def analyze(self, task, data):
            # Expensive analysis
            ...
    """
    def decorator(func):
        cache = {}
        
        @functools.wraps(func)
        async def wrapper(self, task: str, data: Optional[Any] = None) -> AnalyzeResult:
            # Create cache key
            import hashlib
            import json
            import time
            
            key_data = {"task": task, "data": data}
            key = hashlib.md5(
                json.dumps(key_data, sort_keys=True).encode()
            ).hexdigest()
            
            # Check cache
            now = time.time()
            if key in cache:
                cached_result, cached_time = cache[key]
                if now - cached_time < ttl_seconds:
                    logger.debug(f"Cache hit for task: {task[:50]}...")
                    return cached_result
            
            # Call function
            result = await func(self, task, data)
            
            # Store in cache
            cache[key] = (result, now)
            
            # Clean old entries
            for k in list(cache.keys()):
                if now - cache[k][1] > ttl_seconds:
                    del cache[k]
            
            return result
        
        return wrapper
    return decorator