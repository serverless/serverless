"""
LangGraph Code Interpreter Agent

Demonstrates using AWS-managed default code interpreter
for Python code execution in AI agents.

Key features:
- Uses create_code_interpreter_toolkit() from langchain-aws
- Default AWS-managed interpreter (SANDBOX mode)
- Supports data analysis, calculations, visualizations

Environment variables:
- MODEL_ID: Bedrock model ID (default: Claude Sonnet)
- AWS_REGION: AWS region (auto-injected by AgentCore)
"""

import logging
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from langchain.chat_models import init_chat_model
from langchain_aws.tools import create_code_interpreter_toolkit
from langgraph.prebuilt import create_react_agent

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("langgraph-code-interpreter")

# Initialize the AgentCore app
app = BedrockAgentCoreApp()

# Configuration
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")

logger.info(f"Model ID: {MODEL_ID}")
logger.info(f"Region: {AWS_REGION}")


@app.entrypoint
async def invoke(payload, context):
    """
    Main entry point for the code interpreter agent.

    Args:
        payload: Request payload containing the prompt
        context: Runtime context (session info)

    Returns:
        Agent response with code execution results
    """
    prompt = payload.get("prompt", "Hello!")
    session_id = getattr(context, 'session_id', 'default') if context else "default"

    logger.info(f"Session ID: {session_id}")
    logger.info(f"Prompt: {prompt}")

    try:
        # Create code interpreter toolkit (uses AWS-managed default)
        toolkit, code_tools = await create_code_interpreter_toolkit(region=AWS_REGION)

        logger.info(f"Created toolkit with {len(code_tools)} tools")
        logger.info(f"Available tools: {[t.name for t in code_tools]}")

        # Initialize chat model
        llm = init_chat_model(
            MODEL_ID,
            model_provider="bedrock_converse",
        )

        # Create the LangGraph agent with code interpreter tools
        agent = create_react_agent(
            model=llm,
            tools=code_tools,
        )

        # Create config with thread_id for session isolation
        config = {"configurable": {"thread_id": session_id}}

        # Run the agent
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": prompt}]},
            config=config
        )

        # Extract the final response
        final_message = result["messages"][-1].content
        logger.info(f"Response: {final_message[:200]}...")

        # Clean up the toolkit
        await toolkit.cleanup()

        return {
            "result": final_message,
            "tools_used": [t.name for t in code_tools],
            "interpreter_type": "default"
        }

    except Exception as e:
        logger.error(f"Error during agent execution: {e}")
        return {"error": str(e)}


if __name__ == "__main__":
    # Run the app when executed directly
    port = int(os.getenv("PORT", 8080))
    app.run(port=port, host="0.0.0.0")
