"""
Basic Strands AI Agent for AWS Bedrock AgentCore.

This example demonstrates how to create a simple Strands agent
with custom tools deployed to AgentCore Runtime.
"""

import os
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from datetime import datetime
from strands import Agent, tool

# Bypass tool consent for automated execution
os.environ["BYPASS_TOOL_CONSENT"] = "true"

# Initialize the Bedrock AgentCore app
app = BedrockAgentCoreApp()


# Define custom tools using the @tool decorator
@tool
def get_current_time() -> str:
    """Get the current date and time."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@tool
def calculate(expression: str) -> str:
    """
    Safely evaluate a mathematical expression.

    Args:
        expression: A mathematical expression like "2 + 2" or "10 * 5"

    Returns:
        The result of the calculation
    """
    try:
        # Only allow safe mathematical operations
        allowed_chars = set("0123456789+-*/(). ")
        if not all(c in allowed_chars for c in expression):
            return "Error: Invalid characters in expression"
        result = eval(expression, {"__builtins__": {}}, {})
        return str(result)
    except Exception as e:
        return f"Error: {str(e)}"


@tool
def get_weather(location: str) -> str:
    """
    Get weather information for a location (mock implementation).

    Args:
        location: The city or location to get weather for

    Returns:
        Weather information for the location
    """
    # Mock weather data - in production, call a real weather API
    return f"Weather in {location}: Sunny, 72°F (22°C), Humidity: 45%"


# Agent configuration (stateless - create fresh agent per request)
# Using Amazon Nova Micro - fast and no approval required
AGENT_CONFIG = {
    "model": "amazon.nova-micro-v1:0",
    "system_prompt": """You are a helpful AI assistant deployed on AWS Bedrock AgentCore.

You have access to the following tools:
- get_current_time: Returns the current date and time
- calculate: Evaluates mathematical expressions safely
- get_weather: Gets weather information for a location

Be concise and helpful in your responses. Use tools when appropriate.""",
    "tools": [get_current_time, calculate, get_weather],
}


@app.entrypoint
async def invoke(payload, context):
    """
    Main entrypoint for the agent - handles incoming requests with streaming.

    Args:
        payload: The request payload containing the prompt
        context: Runtime context with session info

    Yields:
        Streaming response events from the agent
    """
    try:
        prompt = payload.get("prompt", "Hello!")

        # Create a fresh agent for each request to avoid state issues
        agent = Agent(**AGENT_CONFIG)

        # Stream the agent response
        async for event in agent.stream_async(prompt):
            yield event
    except Exception as e:
        import traceback
        yield {"error": str(e), "traceback": traceback.format_exc()}


if __name__ == "__main__":
    app.run()
