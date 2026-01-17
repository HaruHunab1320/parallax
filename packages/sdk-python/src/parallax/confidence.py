"""Confidence extraction utilities for Parallax Python SDK."""

import functools
import inspect
import json
import re
from typing import Any, Callable, Dict, List, Optional, Tuple, Union


def with_confidence(
    default_confidence: float = 0.5,
    extraction_strategy: str = 'hybrid'
) -> Callable:
    """Decorator for automatic confidence extraction from agent responses.
    
    Args:
        default_confidence: Default confidence if extraction fails (0.0-1.0)
        extraction_strategy: Strategy to use ('llm', 'keywords', 'hybrid')
    
    Returns:
        Decorated function that returns (result, confidence) tuple
    
    Example:
        @with_confidence(default_confidence=0.7)
        async def analyze(self, task: str, data: Any) -> Any:
            result = await self.llm.analyze(data)
            return result  # Confidence will be extracted automatically
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Tuple[Any, float]:
            result = await func(*args, **kwargs)
            
            # Check if already returns tuple with confidence
            if isinstance(result, tuple) and len(result) == 2:
                try:
                    # Verify second element is a number
                    confidence = float(result[1])
                    if 0 <= confidence <= 1:
                        return result
                except (TypeError, ValueError):
                    pass
            
            # Extract confidence based on strategy
            confidence = extract_confidence(
                result, 
                strategy=extraction_strategy,
                default=default_confidence
            )
            
            return (result, confidence)
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs) -> Tuple[Any, float]:
            result = func(*args, **kwargs)
            
            # Check if already returns tuple with confidence
            if isinstance(result, tuple) and len(result) == 2:
                try:
                    confidence = float(result[1])
                    if 0 <= confidence <= 1:
                        return result
                except (TypeError, ValueError):
                    pass
            
            # Extract confidence
            confidence = extract_confidence(
                result,
                strategy=extraction_strategy,
                default=default_confidence
            )
            
            return (result, confidence)
        
        # Return appropriate wrapper based on function type
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def extract_confidence(
    result: Any,
    strategy: str = 'hybrid',
    default: float = 0.5
) -> float:
    """Extract confidence from a result using specified strategy.
    
    Args:
        result: The result to extract confidence from
        strategy: Extraction strategy ('llm', 'keywords', 'hybrid')
        default: Default confidence if extraction fails
    
    Returns:
        Confidence value between 0.0 and 1.0
    """
    if strategy == 'llm':
        return extract_confidence_from_llm(result, default)
    elif strategy == 'keywords':
        return extract_confidence_from_keywords(result, default)
    elif strategy == 'hybrid':
        llm_conf = extract_confidence_from_llm(result, default)
        keyword_conf = extract_confidence_from_keywords(result, default)
        # Weighted average favoring LLM extraction
        return 0.7 * llm_conf + 0.3 * keyword_conf
    else:
        return default


def extract_confidence_from_llm(result: Any, default: float = 0.5) -> float:
    """Extract confidence from LLM-style responses.
    
    Looks for explicit confidence values in the result structure.
    """
    if not result:
        return default
    
    # Check for explicit confidence in result
    if isinstance(result, dict):
        # Direct confidence fields
        confidence_fields = ['confidence', '_confidence', 'score', 'certainty', 'probability']
        for field in confidence_fields:
            if field in result:
                return normalize_confidence(result[field])
        
        # Check nested structures
        if 'metadata' in result and isinstance(result['metadata'], dict):
            for field in confidence_fields:
                if field in result['metadata']:
                    return normalize_confidence(result['metadata'][field])
    
    # Check for confidence in text representation
    text = str(result) if not isinstance(result, str) else result
    
    # Look for confidence patterns
    patterns = [
        r'confidence[:\s]+(\d+\.?\d*)',
        r'certainty[:\s]+(\d+\.?\d*)',
        r'probability[:\s]+(\d+\.?\d*)',
        r'score[:\s]+(\d+\.?\d*)',
        r'(\d+\.?\d*)\s*%\s*(?:confident|certain|sure)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return normalize_confidence(float(match.group(1)))
    
    return default


def extract_confidence_from_keywords(result: Any, default: float = 0.5) -> float:
    """Extract confidence based on keyword analysis."""
    text = json.dumps(result) if isinstance(result, (dict, list)) else str(result)
    text = text.lower()
    
    # Confidence indicators with weights
    high_confidence_words = {
        'definitely': 0.15, 'certainly': 0.15, 'absolutely': 0.15,
        'confirmed': 0.15, 'verified': 0.15, 'guaranteed': 0.15,
        'certain': 0.12, 'sure': 0.12, 'clear': 0.1,
        'obvious': 0.1, 'undoubtedly': 0.12, 'unquestionably': 0.12,
        'conclusive': 0.12, 'definitive': 0.12, 'established': 0.1
    }
    
    medium_confidence_words = {
        'probably': 0.05, 'likely': 0.05, 'appears': 0.05,
        'seems': 0.05, 'suggests': 0.05, 'indicates': 0.05,
        'mostly': 0.04, 'generally': 0.04, 'typically': 0.04,
        'reasonable': 0.05, 'plausible': 0.05, 'expected': 0.04
    }
    
    low_confidence_words = {
        'possibly': -0.15, 'maybe': -0.15, 'might': -0.12,
        'could': -0.1, 'uncertain': -0.15, 'unclear': -0.15,
        'unsure': -0.15, 'doubt': -0.15, 'guess': -0.12,
        'assume': -0.1, 'questionable': -0.15, 'tentative': -0.12,
        'approximate': -0.08, 'estimated': -0.08, 'roughly': -0.08
    }
    
    # Start with base confidence
    score = default
    
    # Apply modifiers based on keywords
    for word, modifier in high_confidence_words.items():
        if word in text:
            score += modifier
    
    for word, modifier in medium_confidence_words.items():
        if word in text:
            score += modifier
    
    for word, modifier in low_confidence_words.items():
        if word in text:
            score += modifier
    
    # Check for hedging language
    hedging_patterns = [
        r'(?:i|we)\s+(?:think|believe|suppose)',
        r'(?:may|might)\s+be',
        r'(?:could|would)\s+(?:be|suggest)',
        r'(?:perhaps|presumably)',
    ]
    
    for pattern in hedging_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            score -= 0.1
    
    # Clamp to valid range
    return max(0.1, min(0.95, score))


def normalize_confidence(value: Union[float, int, str]) -> float:
    """Normalize a confidence value to 0.0-1.0 range."""
    try:
        if isinstance(value, str):
            # Remove % sign if present
            value = value.strip().rstrip('%')
            num_value = float(value)
        else:
            num_value = float(value)
        
        # Already in 0-1 range
        if 0 <= num_value <= 1:
            return num_value
        
        # Percentage (0-100)
        if 1 < num_value <= 100:
            return num_value / 100
        
        # Out of bounds
        return 0.5
        
    except (ValueError, TypeError):
        return 0.5


class ConfidenceAggregator:
    """Utilities for aggregating confidence from multiple sources."""
    
    @staticmethod
    def combine(
        confidences: List[float],
        strategy: str = 'weighted_avg',
        weights: Optional[List[float]] = None
    ) -> float:
        """Combine multiple confidence values.
        
        Args:
            confidences: List of confidence values
            strategy: Combination strategy ('min', 'max', 'avg', 'weighted_avg', 'consensus')
            weights: Optional weights for weighted_avg strategy
        
        Returns:
            Combined confidence value
        """
        if not confidences:
            return 0.5
        
        if strategy == 'min':
            return min(confidences)
        elif strategy == 'max':
            return max(confidences)
        elif strategy == 'avg':
            return sum(confidences) / len(confidences)
        elif strategy == 'weighted_avg':
            if weights and len(weights) == len(confidences):
                total_weight = sum(weights)
                if total_weight == 0:
                    return 0.5
                return sum(c * w for c, w in zip(confidences, weights)) / total_weight
            else:
                # Default to linearly increasing weights
                weights = list(range(1, len(confidences) + 1))
                total_weight = sum(weights)
                return sum(c * w for c, w in zip(confidences, weights)) / total_weight
        elif strategy == 'consensus':
            # Higher confidence when values agree
            mean = sum(confidences) / len(confidences)
            variance = sum((c - mean) ** 2 for c in confidences) / len(confidences)
            # Low variance = high consensus
            consensus_factor = 1 - min(variance * 2, 0.5)  # Cap penalty at 0.5
            return mean * consensus_factor
        else:
            return sum(confidences) / len(confidences)
    
    @staticmethod
    def from_consistency(results: List[Any]) -> float:
        """Calculate confidence based on result consistency.
        
        Args:
            results: List of results to compare
        
        Returns:
            Confidence based on how consistent the results are
        """
        if len(results) < 2:
            return 0.5
        
        # Convert results to comparable strings
        str_results = [json.dumps(r, sort_keys=True) if isinstance(r, (dict, list)) 
                      else str(r) for r in results]
        
        # Count unique results
        unique_results = set(str_results)
        
        # Perfect agreement = high confidence
        if len(unique_results) == 1:
            return 0.95
        
        # Calculate consistency score
        consistency = 1 - (len(unique_results) - 1) / (len(results) - 1)
        
        # Map to confidence range 0.5-0.95
        return 0.5 + (consistency * 0.45)
    
    @staticmethod
    def calibrate(
        raw_confidence: float,
        agent_calibration: Optional[Dict[str, float]] = None
    ) -> float:
        """Calibrate confidence based on agent's historical accuracy.
        
        Args:
            raw_confidence: The raw confidence value
            agent_calibration: Optional calibration data for the agent
        
        Returns:
            Calibrated confidence value
        """
        if not agent_calibration:
            return raw_confidence
        
        # Simple linear calibration based on historical over/under confidence
        bias = agent_calibration.get('bias', 0.0)  # Positive = overconfident
        scale = agent_calibration.get('scale', 1.0)  # Adjust range
        
        # Apply calibration
        calibrated = (raw_confidence - 0.5) * scale + 0.5 - bias
        
        # Ensure valid range
        return max(0.0, min(1.0, calibrated))


# Example usage utilities
def require_confidence(min_confidence: float = 0.7) -> Callable:
    """Decorator that ensures minimum confidence threshold.
    
    Args:
        min_confidence: Minimum required confidence
    
    Returns:
        Decorator that validates confidence levels
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            result = await func(*args, **kwargs)
            
            if isinstance(result, tuple) and len(result) == 2:
                value, confidence = result
                if confidence < min_confidence:
                    raise ValueError(
                        f"Confidence {confidence:.2f} below required "
                        f"threshold {min_confidence:.2f}"
                    )
            
            return result
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            
            if isinstance(result, tuple) and len(result) == 2:
                value, confidence = result
                if confidence < min_confidence:
                    raise ValueError(
                        f"Confidence {confidence:.2f} below required "
                        f"threshold {min_confidence:.2f}"
                    )
            
            return result
        
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator