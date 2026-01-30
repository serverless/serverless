"""
LangGraph Browser Agent

Demonstrates using AgentCore Browser with LangChain/LangGraph for:
- Web navigation and content extraction
- Form interactions and element clicking
- Screenshots and page analysis

Uses langchain_aws.tools.create_browser_toolkit for browser automation.

Reference: https://docs.langchain.com/oss/python/integrations/tools/bedrock_agentcore_browser
"""

import logging
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from langchain.chat_models import init_chat_model
from langchain_aws.tools import create_browser_toolkit
from langgraph.prebuilt import create_react_agent

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("langgraph-browser-agent")

# Initialize the AgentCore app
app = BedrockAgentCoreApp()

# Configuration
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")

# Initialize browser toolkit at module level
# This creates the managed browser connection
toolkit, browser_tools = create_browser_toolkit(region=AWS_REGION)
logger.info(f"Browser toolkit initialized with {len(browser_tools)} tools")

# Initialize chat model
llm = init_chat_model(
    MODEL_ID,
    model_provider="bedrock_converse",
)

# Create the LangGraph agent with browser tools
agent = create_react_agent(
    model=llm,
    tools=browser_tools,
)


@app.entrypoint
async def invoke(payload, context):
    """
    Main entry point for the browser agent.

    Args:
        payload: Request payload containing the prompt
        context: Runtime context (session info)

    Returns:
        Agent response
    """
    prompt = payload.get("prompt", "Hello!")
    session_id = getattr(context, 'session_id', 'default') if context else "default"

    logger.info(f"Session ID: {session_id}")
    logger.info(f"Prompt: {prompt}")
    logger.info(f"Model: {MODEL_ID}")

    # Create config with thread_id for browser session isolation
    config = {"configurable": {"thread_id": session_id}}

    try:
        # Run the agent
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": prompt}]},
            config=config
        )

        # Extract the final response
        final_message = result["messages"][-1].content
        logger.info(f"Response: {final_message[:200]}...")

        return {"result": final_message}

    except Exception as e:
        logger.error(f"Error during agent execution: {e}")
        return {"error": str(e)}


if __name__ == "__main__":
    # Run the app when executed directly
    port = int(os.getenv("PORT", 8080))
    app.run(port=port, host="0.0.0.0")
