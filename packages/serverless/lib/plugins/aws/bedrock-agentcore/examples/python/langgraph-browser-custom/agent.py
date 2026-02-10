"""
LangGraph Custom Browser Agent

Demonstrates using a custom AgentCore browser (with session recording)
instead of the AWS-managed default browser.

Key difference from default browser:
- Default: Uses "aws.browser.v1" identifier
- Custom: Uses your own browser ID with custom configuration

The custom browser is defined in serverless.yml under agents.browsers
and provides:
- Session recording to S3 for debugging/auditing
- Request signing for reduced CAPTCHAs
- Custom IAM role and network configuration

Environment variables:
- CUSTOM_BROWSER_ID: Browser identifier from serverless deployment
- RECORDINGS_BUCKET: S3 bucket where recordings are stored
- MODEL_ID: Bedrock model ID (default: Claude Sonnet)
- AWS_REGION: AWS region (auto-injected by AgentCore)
"""

import logging
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.tools.browser_client import BrowserClient
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from playwright.async_api import async_playwright

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("langgraph-browser-custom")

# Initialize the AgentCore app
app = BedrockAgentCoreApp()

# Configuration
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
CUSTOM_BROWSER_ID = os.environ.get("CUSTOM_BROWSER_ID")
RECORDINGS_BUCKET = os.environ.get("RECORDINGS_BUCKET")

if not CUSTOM_BROWSER_ID:
    logger.warning("CUSTOM_BROWSER_ID not set - will use default browser")

logger.info(f"Custom Browser ID: {CUSTOM_BROWSER_ID}")
logger.info(f"Recordings Bucket: {RECORDINGS_BUCKET}")


# Create browser tool that uses the custom browser
@tool
async def browse_webpage(url: str) -> str:
    """
    Navigate to a webpage and extract its content.

    Args:
        url: The URL to navigate to

    Returns:
        The page title and main text content
    """
    logger.info(f"Navigating to: {url}")

    # Create browser client
    browser_client = BrowserClient(region=AWS_REGION)

    try:
        # Start session with CUSTOM browser identifier (not default)
        # This is the key difference - we pass our custom browser ID
        browser_client.start(identifier=CUSTOM_BROWSER_ID)

        logger.info(f"Started session with browser: {browser_client.identifier}")
        logger.info(f"Session ID: {browser_client.session_id}")

        # Get WebSocket connection info
        ws_url, headers = browser_client.generate_ws_headers()

        # Connect via Playwright
        async with async_playwright() as playwright:
            browser = await playwright.chromium.connect_over_cdp(
                endpoint_url=ws_url,
                headers=headers,
                timeout=30000
            )

            # Get the page
            context = browser.contexts[0]
            page = context.pages[0]

            # Navigate to URL
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Extract content
            title = await page.title()

            # Get main text content
            content = await page.evaluate("""
                () => {
                    const body = document.body;
                    return body ? body.innerText.substring(0, 2000) : '';
                }
            """)

            await browser.close()

        return f"Page Title: {title}\n\nContent:\n{content}"

    finally:
        # Stop the session - this triggers recording upload to S3
        browser_client.stop()
        logger.info("Browser session stopped - recording should be uploaded to S3")


# Initialize chat model
llm = init_chat_model(
    MODEL_ID,
    model_provider="bedrock_converse",
)

# Create the LangGraph agent with our custom browser tool
agent = create_react_agent(
    model=llm,
    tools=[browse_webpage],
)


@app.entrypoint
async def invoke(payload, context):
    """
    Main entry point for the browser agent.

    Args:
        payload: Request payload containing the prompt
        context: Runtime context (session info)

    Returns:
        Agent response with browser info for validation
    """
    prompt = payload.get("prompt", "Hello!")
    session_id = getattr(context, 'session_id', 'default') if context else "default"

    logger.info(f"Session ID: {session_id}")
    logger.info(f"Prompt: {prompt}")
    logger.info(f"Using custom browser: {CUSTOM_BROWSER_ID}")

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
            "browser_id": CUSTOM_BROWSER_ID,
            "recordings_bucket": RECORDINGS_BUCKET
        }

    except Exception as e:
        logger.error(f"Error during agent execution: {e}")
        return {"error": str(e)}


if __name__ == "__main__":
    # Run the app when executed directly
    port = int(os.getenv("PORT", 8080))
    app.run(port=port, host="0.0.0.0")
