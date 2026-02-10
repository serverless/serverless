"""
Strands Browser Agent

Demonstrates using AgentCore Browser with Strands Agents framework for:
- Web navigation and content extraction
- Financial data analysis
- Research and information gathering

The agent uses AWS-managed browser infrastructure via strands_tools.browser.
No custom browser configuration is required in serverless.yml.

Environment variables:
- MODEL_ID: Bedrock model ID (default: Claude Sonnet)
- AWS_REGION: AWS region (auto-injected by AgentCore)
"""

import logging
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.agent.conversation_manager import SlidingWindowConversationManager
from strands_tools.browser import AgentCoreBrowser

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("strands-browser-agent")

# Bypass tool consent for automated deployments
os.environ["BYPASS_TOOL_CONSENT"] = "true"

# Initialize the AgentCore app
app = BedrockAgentCoreApp()

# Configuration
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")

# Initialize browser tool at module level
# Uses AWS-managed default browser infrastructure
browser_tool = AgentCoreBrowser(region=AWS_REGION)
logger.info(f"Browser tool initialized for region: {AWS_REGION}")


def create_agent():
    """
    Create a Strands agent with browser capabilities.

    Returns:
        Configured Strands Agent instance
    """
    # Conversation manager to handle token limits
    conversation_manager = SlidingWindowConversationManager(
        window_size=25,
        per_turn=True
    )

    return Agent(
        model=MODEL_ID,
        tools=[browser_tool.browser],
        conversation_manager=conversation_manager,
        system_prompt="""You are an intelligent research assistant with web browsing capabilities.

Your capabilities:
- Navigate to websites and extract information
- Analyze financial data from stock market websites
- Research topics by visiting multiple sources
- Extract structured data from web pages

Guidelines:
1. Use the browser tool efficiently - aim for 2-3 interactions per task
2. Extract specific data points with actual numbers
3. Summarize findings clearly with sources
4. Handle errors gracefully and try alternative approaches

For financial analysis, focus on:
- Current prices and trends
- Key metrics (P/E, Market Cap, Volume)
- Recent news and market sentiment
- Analyst recommendations""",
    )


@app.entrypoint
async def invoke(payload, context):
    """
    Main entry point for the browser agent.

    Args:
        payload: Request payload containing the prompt
        context: Runtime context (session info)

    Yields:
        Streaming events from the agent
    """
    prompt = payload.get("prompt", "Hello!")
    session_id = getattr(context, 'session_id', 'default') if context else "default"

    logger.info(f"Session ID: {session_id}")
    logger.info(f"Prompt: {prompt}")
    logger.info(f"Model: {MODEL_ID}")

    # Create agent for this request
    agent = create_agent()

    # Stream the response
    async for event in agent.stream_async(prompt):
        yield event


if __name__ == "__main__":
    # Run the app when executed directly
    port = int(os.getenv("PORT", 8080))
    app.run(port=port, host="0.0.0.0")
