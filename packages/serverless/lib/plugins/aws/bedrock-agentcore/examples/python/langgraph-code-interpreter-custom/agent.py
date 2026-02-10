"""
LangGraph Custom Code Interpreter Agent

Demonstrates using a custom AgentCore code interpreter (with PUBLIC network mode)
instead of the AWS-managed default interpreter (SANDBOX mode).

Key difference from default interpreter:
- Default: Uses "aws.codeinterpreter.v1" identifier (SANDBOX - no network)
- Custom: Uses your own interpreter ID with PUBLIC network access

The custom interpreter is defined in serverless.yml under agents.codeInterpreters
and provides:
- PUBLIC network mode for external API access
- Ability to fetch data from internet
- Custom IAM role configuration

Environment variables:
- CUSTOM_INTERPRETER_ID: Code interpreter identifier from serverless deployment
- MODEL_ID: Bedrock model ID (default: Claude Sonnet)
- AWS_REGION: AWS region (auto-injected by AgentCore)
"""

import logging
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.tools.code_interpreter_client import CodeInterpreter
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("langgraph-code-interpreter-custom")

# Initialize the AgentCore app
app = BedrockAgentCoreApp()

# Configuration
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
CUSTOM_INTERPRETER_ID = os.environ.get("CUSTOM_INTERPRETER_ID")

if not CUSTOM_INTERPRETER_ID:
    logger.warning("CUSTOM_INTERPRETER_ID not set - will use default interpreter")

logger.info(f"Custom Interpreter ID: {CUSTOM_INTERPRETER_ID}")
logger.info(f"Model ID: {MODEL_ID}")


# Create code execution tool that uses the custom interpreter
@tool
def execute_python_code(code: str) -> str:
    """
    Execute Python code in a secure AWS sandbox environment with PUBLIC network access.

    This tool can:
    - Perform calculations and data analysis
    - Fetch data from external APIs (PUBLIC mode enabled)
    - Process and transform data
    - Generate text output

    Args:
        code: Python code to execute

    Returns:
        The output from code execution
    """
    logger.info(f"Executing code:\n{code[:200]}...")

    # Create code interpreter client
    code_interpreter = CodeInterpreter(region=AWS_REGION)

    try:
        # Start session with CUSTOM interpreter identifier (not default)
        # This is the key difference - we pass our custom interpreter ID
        code_interpreter.start(identifier=CUSTOM_INTERPRETER_ID)

        logger.info(f"Started session with interpreter: {code_interpreter.identifier}")
        logger.info(f"Session ID: {code_interpreter.session_id}")

        # Execute the code
        response = code_interpreter.invoke(
            method="executeCode",
            params={"code": code, "language": "python"}
        )

        # Extract output from response stream
        output = []
        for event in response.get("stream", []):
            if "result" in event:
                result = event["result"]
                for content_item in result.get("content", []):
                    if content_item.get("type") == "text":
                        output.append(content_item["text"])

        result_text = "\n".join(output)
        logger.info(f"Execution result: {result_text[:200]}...")

        return result_text

    finally:
        # Stop the session
        code_interpreter.stop()
        logger.info("Code interpreter session stopped")


# Initialize chat model
llm = init_chat_model(
    MODEL_ID,
    model_provider="bedrock_converse",
)

# Create the LangGraph agent with our custom code execution tool
agent = create_react_agent(
    model=llm,
    tools=[execute_python_code],
)


@app.entrypoint
async def invoke(payload, context):
    """
    Main entry point for the code interpreter agent.

    Args:
        payload: Request payload containing the prompt
        context: Runtime context (session info)

    Returns:
        Agent response with interpreter info for validation
    """
    prompt = payload.get("prompt", "Hello!")
    session_id = getattr(context, 'session_id', 'default') if context else "default"

    logger.info(f"Session ID: {session_id}")
    logger.info(f"Prompt: {prompt}")
    logger.info(f"Using custom interpreter: {CUSTOM_INTERPRETER_ID}")

    # Create config with thread_id for session isolation
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

        return {
            "result": final_message,
            "interpreter_id": CUSTOM_INTERPRETER_ID,
            "network_mode": "PUBLIC"
        }

    except Exception as e:
        logger.error(f"Error during agent execution: {e}")
        return {"error": str(e)}


if __name__ == "__main__":
    # Run the app when executed directly
    port = int(os.getenv("PORT", 8080))
    app.run(port=port, host="0.0.0.0")
