"""
Strands Agent with Automatic Packaging Example

This handler demonstrates a Strands AI agent deployed to AWS Bedrock AgentCore
using the Framework's automatic packaging feature.

The handler uses BedrockAgentCoreApp with @app.entrypoint decorator,
which is required for AgentCore S3 code deployment.
"""

import os
from datetime import datetime
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool

# Bypass tool consent for automated deployments
os.environ["BYPASS_TOOL_CONSENT"] = "true"

# Initialize the AgentCore app
app = BedrockAgentCoreApp()


# Define custom tools for the agent
@tool
def get_current_time() -> str:
    """Get the current date and time.

    Returns:
        str: Current date and time in a readable format
    """
    now = datetime.now()
    return now.strftime("%Y-%m-%d %H:%M:%S")


@tool
def calculate(expression: str) -> str:
    """Evaluate a mathematical expression.

    Args:
        expression: A mathematical expression to evaluate (e.g., "2 + 2", "10 * 5")

    Returns:
        str: The result of the calculation
    """
    try:
        # Only allow safe mathematical operations
        allowed_chars = set("0123456789+-*/.() ")
        if not all(c in allowed_chars for c in expression):
            return "Error: Only basic math operations are allowed"

        result = eval(expression)
        return f"{expression} = {result}"
    except Exception as e:
        return f"Error calculating: {str(e)}"


@tool
def get_weather(city: str) -> str:
    """Get weather information for a city (mock implementation).

    Args:
        city: The name of the city

    Returns:
        str: Weather information for the city
    """
    # Mock weather data
    weather_data = {
        "new york": {"temp": 72, "condition": "Partly cloudy"},
        "london": {"temp": 59, "condition": "Rainy"},
        "tokyo": {"temp": 68, "condition": "Clear"},
        "paris": {"temp": 64, "condition": "Sunny"},
        "sydney": {"temp": 77, "condition": "Warm and sunny"},
    }

    city_lower = city.lower()
    if city_lower in weather_data:
        data = weather_data[city_lower]
        return f"Weather in {city}: {data['temp']}°F, {data['condition']}"
    else:
        return f"Weather data not available for {city}. Try: New York, London, Tokyo, Paris, or Sydney."


# Create the Strands agent with tools
agent = Agent(
    model="us.amazon.nova-micro-v1:0",
    tools=[get_current_time, calculate, get_weather],
    system_prompt="""You are a helpful AI assistant with access to tools.
You can:
- Tell the current time using get_current_time
- Perform calculations using calculate
- Get weather information using get_weather

Always be helpful and use your tools when appropriate.""",
)


@app.entrypoint
def invoke(payload, context):
    """
    Main entry point for the AgentCore runtime.

    Args:
        payload: The request payload containing the prompt
        context: Runtime context information

    Returns:
        dict: Response with the agent's answer
    """
    prompt = payload.get("prompt", "Hello!")

    # Run the agent
    response = agent(prompt)

    return {
        "response": str(response),
        "model": "us.amazon.nova-micro-v1:0",
        "tools_available": ["get_current_time", "calculate", "get_weather"],
    }


if __name__ == "__main__":
    # Run the app when executed directly (for AgentCore runtime)
    app.run()
