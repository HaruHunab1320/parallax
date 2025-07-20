"""Server utilities for Parallax Python agents."""

import asyncio
import logging
import signal
import sys
from typing import Any, Optional, Type

from .agent import ParallaxAgent
from .grpc_agent import GrpcParallaxAgent, serve_grpc_agent

logger = logging.getLogger(__name__)


async def serve_agent(
    agent: ParallaxAgent,
    port: int = 0,
    max_workers: int = 10,
) -> int:
    """Start an agent as a gRPC server.
    
    Args:
        agent: The agent to serve
        port: Port to listen on (0 for auto-assign)
        max_workers: Maximum number of worker threads
        
    Returns:
        Actual port the server is listening on
    """
    # Use gRPC implementation if not already a GrpcParallaxAgent
    if isinstance(agent, GrpcParallaxAgent):
        actual_port = await agent.serve(port, max_workers)
    else:
        actual_port = await serve_grpc_agent(agent, port)
    
    # Setup signal handlers for graceful shutdown
    loop = asyncio.get_event_loop()
    
    def signal_handler(sig, frame):
        logger.info(f"Received signal {sig}, shutting down...")
        asyncio.create_task(agent.shutdown())
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    return actual_port


async def create_and_serve(
    agent_class: Type[ParallaxAgent],
    *args,
    port: int = 0,
    max_workers: int = 10,
    **kwargs
) -> tuple[ParallaxAgent, int]:
    """Create and serve an agent in one call.
    
    Args:
        agent_class: The agent class to instantiate
        *args: Positional arguments for agent constructor
        port: Port to listen on (0 for auto-assign)
        max_workers: Maximum number of worker threads
        **kwargs: Keyword arguments for agent constructor
        
    Returns:
        Tuple of (agent instance, actual port)
    """
    # Create agent instance
    agent = agent_class(*args, **kwargs)
    
    # Start serving
    actual_port = await serve_agent(agent, port, max_workers)
    
    return agent, actual_port


def run_agent(agent: ParallaxAgent, port: int = 0):
    """Run an agent synchronously (blocking).
    
    Args:
        agent: The agent to run
        port: Port to listen on (0 for auto-assign)
    """
    async def _run():
        actual_port = await serve_agent(agent, port)
        print(f"""
===========================================
{agent.name} Started
===========================================
Agent ID: {agent.id}
Port: {actual_port}
Capabilities: {', '.join(agent.capabilities)}

To use this agent with Parallax:
1. Register it with the control plane
2. Or set environment variable:
   PARALLAX_LOCAL_AGENTS="{agent.id}:{agent.name}:localhost:{actual_port}:{','.join(agent.capabilities)}"
===========================================
        """)
        
        # Wait for termination
        await agent.wait_for_termination()
    
    # Run the async function
    asyncio.run(_run())


def create_agent_cli():
    """Create a CLI for an agent (useful for standalone scripts)."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Run a Parallax agent'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=0,
        help='Port to listen on (0 for auto-assign)'
    )
    parser.add_argument(
        '--workers',
        type=int,
        default=10,
        help='Maximum number of worker threads'
    )
    parser.add_argument(
        '--log-level',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help='Logging level'
    )
    
    return parser