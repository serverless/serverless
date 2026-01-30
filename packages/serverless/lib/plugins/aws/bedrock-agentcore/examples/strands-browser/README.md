# Strands Browser Example

This example demonstrates using AgentCore Browser with the Strands Agents framework for web automation and research tasks.

## Features

- **AWS-managed browser** - No custom browser configuration needed
- **Strands integration** - Uses `strands_tools.browser.AgentCoreBrowser`
- **Streaming responses** - Real-time output via `agent.stream_async()`
- **Financial analysis** - Example use case for stock data extraction

## Project Structure

```
strands-browser/
├── serverless.yml      # Serverless configuration
├── agent.py            # Strands agent with browser tool
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

```
agents:
  browserAgent: https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/xxx/invocations
```

### 3. Test

```bash
export RUNTIME_ARN="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/xxx"
python test-invoke.py
```

## How It Works

### AWS-Managed Browser

This example uses the AWS-managed default browser. No `agents.browsers` configuration is needed in `serverless.yml`:

```yaml
agents:
  browserAgent: {}  # Auto-detects Dockerfile
```

### Strands Integration

The agent uses `AgentCoreBrowser` from `strands_tools.browser`:

```python
from strands_tools.browser import AgentCoreBrowser

# Initialize browser (uses AWS-managed infrastructure)
browser_tool = AgentCoreBrowser(region="us-east-1")

# Create agent with browser capability
agent = Agent(
    tools=[browser_tool.browser],
    model="us.anthropic.claude-sonnet-4-20250514-v1:0"
)
```

### Example Prompts

**Web Search:**
```
Search for the latest news about AWS and summarize the top 3 headlines
```

**Financial Analysis:**
```
Analyze the Tesla stock page at https://www.marketwatch.com/investing/stock/tsla
and provide key financial metrics
```

**Data Extraction:**
```
Visit https://aws.amazon.com/about-aws/whats-new/ and list the 5 most recent announcements
```

## Custom Browser Configuration

If you need session recording, VPC access, or request signing, define a custom browser:

```yaml
agents:
  browsers:
    customBrowser:
      network:
        mode: PUBLIC
      recording:
        enabled: true
        s3Location:
          bucket: my-recordings
          prefix: sessions/

  browserAgent: {}
```

See the [Browser documentation](../../../../../../docs/sf/providers/aws/guide/agents/browser.md) for full configuration options.

## Cleanup

```bash
serverless remove
```

## Next Steps

- [Browser Documentation](../../../../../../docs/sf/providers/aws/guide/agents/browser.md) - Full configuration reference
- [Memory Example](../langgraph-memory/) - Add conversation persistence
- [Gateway Example](../langgraph-gateway/) - Add custom Lambda tools
