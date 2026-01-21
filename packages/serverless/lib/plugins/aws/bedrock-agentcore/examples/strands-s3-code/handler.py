"""
Strands AI Agent for AWS Bedrock AgentCore (S3 Code Deployment).

This example demonstrates S3-based deployment without Docker.
Uses BedrockAgentCoreApp with @app.entrypoint decorator.
"""

import os
from datetime import datetime
from bedrock_agentcore.runtime import BedrockAgentCoreApp
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
    return f"Weather in {location}: Sunny, 72°F (22°C), Humidity: 45%"


# Agent configuration
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
def invoke(payload, context):
    """
    Main entrypoint for the agent - called by AgentCore Runtime.

    Args:
        payload: The request payload containing the prompt
        context: Runtime context with session info

    Returns:
        The agent's response as a dictionary
    """
    try:
        prompt = payload.get("prompt", "Hello!")

        # Create a fresh agent for each request
        agent = Agent(**AGENT_CONFIG)

        # Invoke the agent with the user's prompt
        result = agent(prompt)

        # Extract the response text
        response_text = result.message
        if isinstance(response_text, dict) and "content" in response_text:
            content = response_text["content"]
            if isinstance(content, list) and len(content) > 0:
                response_text = content[0].get("text", str(content))

        return {"result": response_text}

    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


if __name__ == "__main__":
    app.run()
