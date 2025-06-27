# Weather Analysis Agent
FROM parallax/agent-python:latest

WORKDIR /app/agent

# Copy agent code
COPY weather_agent.py ./

# Expose gRPC port
EXPOSE 50051

# Run the weather agent
CMD ["python", "weather_agent.py"]