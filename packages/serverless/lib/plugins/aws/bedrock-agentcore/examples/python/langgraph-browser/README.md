# LangGraph Browser Example

This example demonstrates using AgentCore Browser with LangChain/LangGraph for web automation and research tasks.

## Features

- **LangChain Integration** - Uses `langchain_aws.tools.create_browser_toolkit`
- **React Agent** - LangGraph's `create_react_agent` for tool orchestration
- **Full Browser Control** - Navigate, click, type, extract, screenshot

## Project Structure

```text
langgraph-browser/
├── serverless.yml      # Serverless configuration
├── agent.py            # LangGraph agent with browser toolkit
├── pyproject.toml      # Python dependencies
├── Dockerfile          # Container configuration
├── test-invoke.py      # Test script
└── README.md           # This file
```

## Quick Start

### 1. Deploy

```bash
serverless deploy
```

### 2. Note the Runtime ARN

After deployment, note the runtime ARN from the output:

```yaml
ai:
  agents:
    browserAgent: https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/xxx/invocations
```

### 3. Test

```bash
export RUNTIME_ARN="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/xxx"
python test-invoke.py
```

## How It Works

### Browser Toolkit

The example uses `langchain_aws.tools.create_browser_toolkit` which provides these tools:

| Tool                 | Description                            |
| -------------------- | -------------------------------------- |
| `navigate_browser`   | Navigate to a URL                      |
| `click_element`      | Click on an element using CSS selector |
| `type_text`          | Type text into an input field          |
| `extract_text`       | Extract all text content from the page |
| `extract_hyperlinks` | Extract all hyperlinks from the page   |
| `get_elements`       | Get elements matching a CSS selector   |
| `current_webpage`    | Get the current page URL and title     |
| `navigate_back`      | Go back to the previous page           |
| `take_screenshot`    | Take a screenshot of the page          |
| `scroll_page`        | Scroll the page in a direction         |
| `wait_for_element`   | Wait for an element to appear          |

### LangGraph Agent

```python
from langchain.chat_models import init_chat_model
from langchain_aws.tools import create_browser_toolkit
from langgraph.prebuilt import create_react_agent

# Create toolkit
toolkit, browser_tools = create_browser_toolkit(region="us-east-1")

# Initialize chat model
llm = init_chat_model(
    "us.anthropic.claude-sonnet-4-20250514-v1:0",
    model_provider="bedrock_converse",
)

# Create agent with browser tools
agent = create_react_agent(
    model=llm,
    tools=browser_tools,
)

# Run with session isolation
config = {"configurable": {"thread_id": "session-123"}}
result = await agent.ainvoke(
    {"messages": [{"role": "user", "content": "Navigate to example.com"}]},
    config=config
)
```

### Session Isolation

Each `thread_id` gets its own browser session, enabling concurrent usage:

```python
# Each thread gets its own browser session
config_user1 = {"configurable": {"thread_id": "user-1"}}
config_user2 = {"configurable": {"thread_id": "user-2"}}
```

## Example Prompts

**Navigation:**

```text
Navigate to https://example.com and tell me the main heading
```

**Extract Links:**

```text
Navigate to https://aws.amazon.com and extract the first 5 hyperlinks
```

**Page Analysis:**

```text
Navigate to https://python.org and describe the main sections
```

**Form Interaction:**

```text
Navigate to https://google.com, type "AWS Lambda" in the search box
```

## Dependencies

- `langchain-aws` - AWS integrations for LangChain
- `langgraph` - Agent orchestration
- `playwright` - Browser automation (required by browser toolkit)
- `beautifulsoup4` - HTML parsing

## Reference

- [LangChain AgentCore Browser Docs](https://docs.langchain.com/oss/python/integrations/tools/bedrock_agentcore_browser)
- [AWS AgentCore Browser Documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-tool.html)

## Cleanup

```bash
serverless remove
```

## Next Steps

- [Gateway Example](../langgraph-gateway/) - Add custom Lambda tools
- [Memory Example](../langgraph-memory/) - Add conversation persistence
- [Browser Documentation](../../../../../../../docs/sf/providers/aws/guide/agents/browser.md) - Full configuration reference
