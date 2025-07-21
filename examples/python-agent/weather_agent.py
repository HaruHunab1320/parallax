#!/usr/bin/env python3
"""
Example weather analysis agent for Parallax.

This demonstrates:
- Basic agent implementation
- Confidence based on data quality
- Confidence based on data quality
- Expressing uncertainty
"""

import asyncio
import logging
from typing import Any, Optional

# This would normally be: from parallax import ParallaxAgent, serve_agent, etc.
# For now, we'll use a direct import
import sys
sys.path.append('../../packages/sdk-python/src')

from parallax import ParallaxAgent, run_agent

logging.basicConfig(level=logging.INFO)


class WeatherAnalysisAgent(ParallaxAgent):
    """Agent that analyzes weather conditions and provides recommendations."""
    
    def __init__(self):
        super().__init__(
            agent_id="weather-python-1",
            name="Python Weather Analyzer",
            capabilities=["analysis", "weather", "forecast", "recommendation"],
            metadata={
                "expertise": 0.85,
                "capability_scores": {
                    "weather": 0.9,
                    "forecast": 0.8,
                    "recommendation": 0.85,
                },
                "version": "1.0.0",
                "language": "python",
            }
        )
        
    async def analyze(
        self, task: str, data: Optional[Any] = None
    ) -> tuple[Any, float]:
        """Analyze weather conditions and provide recommendations."""
        
        # Check required data
        if not data or "temperature" not in data:
            return {
                "error": "Missing required temperature data"
            }, 0.0
        
        temperature = data.get("temperature")
        humidity = data.get("humidity", 50)  # Default 50%
        wind_speed = data.get("wind_speed", 0)  # Default 0 km/h
        conditions = data.get("conditions", "clear")
        
        # Base confidence on data completeness
        confidence = 0.6  # Base confidence
        
        if humidity != 50:  # Non-default value
            confidence += 0.1
        if wind_speed != 0:
            confidence += 0.1
        if conditions != "clear":
            confidence += 0.1
        
        # Analyze temperature
        if temperature > 35:
            temp_desc = "extremely hot"
            recommendation = "Stay indoors, stay hydrated"
        elif temperature > 28:
            temp_desc = "hot"
            recommendation = "Wear light clothing, stay hydrated"
        elif temperature > 20:
            temp_desc = "warm"
            recommendation = "Perfect weather for outdoor activities"
        elif temperature > 10:
            temp_desc = "mild"
            recommendation = "Light jacket recommended"
        elif temperature > 0:
            temp_desc = "cold"
            recommendation = "Wear warm clothing"
            # Cold weather patterns are less predictable
        else:
            temp_desc = "freezing"
            recommendation = "Stay warm, watch for ice"
            confidence = min(confidence, 0.8)  # Cap confidence for extreme weather
        
        # Adjust for other conditions
        if conditions == "rain":
            recommendation += ", bring an umbrella"
            if temperature < 5:
                recommendation += " (watch for freezing rain)"
                # Freezing rain conditions are hazardous
                confidence *= 0.9
        elif conditions == "snow":
            recommendation = "Drive carefully, " + recommendation
            confidence *= 0.85  # Snow makes predictions less certain
        
        # High wind adjustment
        if wind_speed > 50:
            recommendation += ", strong wind warning"
            # High winds may cause rapid weather changes
            confidence *= 0.9
        
        # Create detailed result
        result = {
            "temperature": temperature,
            "temperature_desc": temp_desc,
            "conditions": conditions,
            "humidity": humidity,
            "wind_speed": wind_speed,
            "recommendation": recommendation,
            "comfort_index": self._calculate_comfort_index(
                temperature, humidity, wind_speed
            ),
            "alerts": self._generate_alerts(temperature, conditions, wind_speed),
        }
        
        # Task-specific analysis
        task_lower = task.lower()
        if "outdoor" in task_lower or "activity" in task_lower:
            result["outdoor_suitability"] = self._outdoor_suitability(
                temperature, conditions, wind_speed
            )
        elif "travel" in task_lower or "driving" in task_lower:
            result["travel_safety"] = self._travel_safety(
                temperature, conditions, wind_speed
            )
        
        # Ensure confidence is within bounds
        confidence = max(0.1, min(0.99, confidence))
        
        # Add reasoning
        result["reasoning"] = (
            f"Analysis completed by {self.name} "
            f"with confidence {confidence:.2f} based on "
            f"{'complete' if humidity != 50 and wind_speed != 0 else 'partial'} data"
        )
        
        # Add uncertainties if any
        uncertainties = []
        if temperature < 0:
            uncertainties.append("Cold weather patterns are less predictable")
        if conditions == "rain" and temperature < 5:
            uncertainties.append("Freezing rain conditions are hazardous")
        if wind_speed > 50:
            uncertainties.append("High winds may cause rapid weather changes")
        
        if uncertainties:
            result["uncertainties"] = uncertainties
        
        return result, confidence
    
    def _calculate_comfort_index(
        self, temp: float, humidity: float, wind: float
    ) -> float:
        """Calculate comfort index (0-100)."""
        # Simple comfort calculation
        comfort = 100
        
        # Temperature penalty
        if temp > 30:
            comfort -= (temp - 30) * 3
        elif temp < 10:
            comfort -= (10 - temp) * 2
        
        # Humidity penalty
        if humidity > 70:
            comfort -= (humidity - 70) * 0.5
        elif humidity < 30:
            comfort -= (30 - humidity) * 0.3
        
        # Wind penalty
        if wind > 30:
            comfort -= (wind - 30) * 0.5
        
        return max(0, min(100, comfort))
    
    def _generate_alerts(
        self, temp: float, conditions: str, wind: float
    ) -> list[str]:
        """Generate weather alerts."""
        alerts = []
        
        if temp > 40:
            alerts.append("Extreme heat warning")
        elif temp < -10:
            alerts.append("Extreme cold warning")
        
        if wind > 60:
            alerts.append("High wind warning")
        elif wind > 40:
            alerts.append("Wind advisory")
        
        if conditions == "storm":
            alerts.append("Storm warning")
        elif conditions == "snow" and temp > -2:
            alerts.append("Wet snow advisory")
        
        return alerts
    
    def _outdoor_suitability(
        self, temp: float, conditions: str, wind: float
    ) -> str:
        """Determine suitability for outdoor activities."""
        if conditions in ["storm", "heavy rain"]:
            return "poor"
        elif temp > 35 or temp < -5:
            return "poor"
        elif wind > 50:
            return "poor"
        elif 15 <= temp <= 25 and conditions == "clear" and wind < 20:
            return "excellent"
        elif 10 <= temp <= 30 and conditions != "rain":
            return "good"
        else:
            return "fair"
    
    def _travel_safety(
        self, temp: float, conditions: str, wind: float
    ) -> str:
        """Assess travel safety."""
        if conditions == "storm" or wind > 70:
            return "dangerous"
        elif conditions == "snow" or (conditions == "rain" and temp < 2):
            return "hazardous"
        elif conditions == "fog":
            return "use caution"
        elif wind > 50:
            return "use caution"
        else:
            return "safe"


async def main():
    """Run the weather agent."""
    agent = WeatherAnalysisAgent()
    
    # Example: Test the agent locally before serving
    print("Testing agent locally...")
    result, confidence = await agent.analyze(
        "What's the weather recommendation?",
        {
            "temperature": 22,
            "humidity": 65,
            "wind_speed": 15,
            "conditions": "partly cloudy"
        }
    )
    print(f"Result: {result}")
    print(f"Confidence: {confidence}")
    
    # Start serving
    print("\nStarting gRPC server...")
    run_agent(agent)


if __name__ == "__main__":
    asyncio.run(main())