<!--
title: Serverless Framework - AgentCore Browser Configuration
description: Add web automation capabilities to your AI agents using AgentCore Browser
short_title: Browser
keywords:
  [
    'Serverless Framework',
    'AWS Bedrock',
    'AgentCore',
    'Browser',
    'Web Automation',
    'Strands',
    'Session Recording',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/browser)

<!-- DOCS-SITE-LINK:END -->

# Browser Configuration

Browser enables your AI agents to navigate web pages, extract information, and interact with websites. AgentCore provides managed browser infrastructure that integrates seamlessly with the Strands Agents framework.

## Quick Start

The simplest way to add browser capabilities is using the AWS-managed default browser with Strands:

**Configuration (`serverless.yml`):**

```yml
service: my-browser-agent

provider:
  name: aws
  region: us-east-1

agents:
  webAgent: {}  # Auto-detects Dockerfile
```

**Agent code (`agent.py`):**

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands_tools.browser import AgentCoreBrowser

app = BedrockAgentCoreApp()

# Initialize browser tool (uses AWS-managed infrastructure)
browser_tool = AgentCoreBrowser(region="us-east-1")

@app.entrypoint
async def invoke(payload, context):
    agent = Agent(
        tools=[browser_tool.browser],
        model="us.anthropic.claude-sonnet-4-20250514-v1:0",
        system_prompt="""You are an AI assistant with web browsing capabilities.
Use the browser tool to navigate websites and extract information."""
    )

    prompt = payload.get("prompt", "Hello!")
    async for event in agent.stream_async(prompt):
        yield event

app.run()
```

**Dependencies (`requirements.txt`):**

```
bedrock-agentcore>=0.1.0
strands-agents>=1.0.0
strands-agents-tools>=0.1.0
```

The framework automatically handles browser infrastructure - no additional configuration required.

## How It Works

When your agent uses the browser tool:

1. **Agent Request**: Your Strands agent calls `browser_tool.browser` with navigation instructions
2. **AWS Infrastructure**: AgentCore manages browser sessions in isolated environments
3. **Web Interaction**: The browser navigates, clicks, extracts content as instructed
4. **Response**: Results flow back to your agent for processing

```
Agent → Strands → AgentCoreBrowser → AWS Browser Service → Website → Response
```

## Using Browser with Strands Agents

Strands provides the best integration with AgentCore Browser through `strands_tools.browser.AgentCoreBrowser`.

### Basic Pattern

```python
from strands import Agent
from strands_tools.browser import AgentCoreBrowser

# Initialize browser (uses AWS-managed default)
browser_tool = AgentCoreBrowser(region="us-east-1")

# Create agent with browser capability
agent = Agent(
    tools=[browser_tool.browser],
    model="us.anthropic.claude-sonnet-4-20250514-v1:0",
    system_prompt="""You are a research assistant that can browse the web.
When asked about current information, use the browser to find answers."""
)

# Use the agent
result = agent("What are the latest AWS announcements?")
```

### Financial Analysis Example

```python
from strands import Agent
from strands_tools.browser import AgentCoreBrowser

browser_tool = AgentCoreBrowser(region="us-east-1")

agent = Agent(
    tools=[browser_tool.browser],
    model="us.anthropic.claude-sonnet-4-20250514-v1:0",
    system_prompt="""You are a financial analyst with web browsing capabilities.

When analyzing stocks or financial websites:
1. Navigate to the requested URL
2. Extract key metrics: price, P/E ratio, market cap, volume
3. Identify trends and recent movements
4. Provide actionable insights with specific numbers"""
)

# Analyze a stock
result = agent("Analyze Tesla stock at https://www.marketwatch.com/investing/stock/tsla")
```

### Combining Browser with Other Tools

```python
from strands import Agent
from strands_tools.browser import AgentCoreBrowser
from strands_tools.code_interpreter import AgentCoreCodeInterpreter

browser_tool = AgentCoreBrowser(region="us-east-1")
code_interpreter = AgentCoreCodeInterpreter(region="us-east-1")

agent = Agent(
    tools=[browser_tool.browser, code_interpreter.code_interpreter],
    model="us.anthropic.claude-sonnet-4-20250514-v1:0",
    system_prompt="""You are a data analyst that can:
- Browse websites to gather data
- Execute Python code for analysis and visualization"""
)
```

## Custom Browser Resources

For advanced scenarios, define custom browser resources with specific configurations:

### When to Use Custom Browsers

| Scenario | Recommendation |
|----------|----------------|
| Basic web browsing | Use AWS-managed default |
| Need session recording | Define custom browser |
| Access VPC-only resources | Define custom browser with VPC mode |
| Require request signing | Define custom browser with signing |

### Basic Custom Browser

```yml
agents:
  browsers:
    webBrowser:
      description: Web scraping browser
      network:
        mode: PUBLIC
      tags:
        Purpose: WebScraping
```

### Browser with Session Recording

Record browser sessions to S3 for debugging and auditing:

```yml
agents:
  browsers:
    recordingBrowser:
      description: Browser with session recording enabled
      network:
        mode: PUBLIC
      recording:
        enabled: true
        s3Location:
          bucket: ${self:service}-recordings-${self:provider.stage}
          prefix: browser-sessions/
      signing:
        enabled: true
```

### Browser with VPC Access

Access internal resources through VPC:

```yml
agents:
  browsers:
    privateBrowser:
      description: Browser for internal resources
      network:
        mode: VPC
        subnets:
          - subnet-12345678
          - subnet-87654321
        securityGroups:
          - sg-12345678
```

## Configuration Reference

### Browser Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `network` | object | Yes | Network configuration |
| `description` | string | No | Human-readable description (1-1200 chars) |
| `recording` | object | No | Session recording configuration |
| `signing` | object | No | Request signing configuration |
| `role` | string/object | No | IAM role ARN or configuration |
| `tags` | object | No | Resource tags |

### Network Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `mode` | string | Yes | `PUBLIC` or `VPC` |
| `subnets` | array | VPC only | VPC subnet IDs |
| `securityGroups` | array | VPC only | Security group IDs |

### Recording Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `enabled` | boolean | No | Enable session recording |
| `s3Location.bucket` | string | If enabled | S3 bucket for recordings |
| `s3Location.prefix` | string | No | S3 key prefix |

### Signing Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `enabled` | boolean | No | Enable request signing |

## Session Recording

Session recording captures browser interactions for debugging and compliance:

**Use cases:**
- Debug failed browser automation
- Audit agent behavior for compliance
- Review extracted data accuracy
- Training and improvement analysis

**Configuration:**

```yml
agents:
  browsers:
    auditBrowser:
      network:
        mode: PUBLIC
      recording:
        enabled: true
        s3Location:
          bucket: my-audit-bucket
          prefix: agent-sessions/
```

Recordings are stored in the specified S3 bucket and can be reviewed to understand how the agent interacted with websites.

## IAM Role Configuration

The framework automatically creates IAM roles with necessary permissions. To customize:

```yml
agents:
  browsers:
    customBrowser:
      network:
        mode: PUBLIC
      role:
        name: custom-browser-role
        statements:
          - Effect: Allow
            Action:
              - s3:PutObject
            Resource: arn:aws:s3:::my-bucket/*
        tags:
          Team: AI
```

## Examples

- [LangGraph Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-browser) - LangChain/LangGraph with browser toolkit
- [LangGraph Browser Custom](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-browser-custom) - Custom browser with session recording
- [Strands Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/strands-browser) - Strands Agents with AgentCoreBrowser

## Next Steps

- [Code Interpreter](./code-interpreter.md) - Python code execution capabilities
- [Memory Configuration](./memory.md) - Conversation persistence
- [Gateway Configuration](./gateway.md) - Custom Lambda tools
- [Runtime Configuration](./runtime.md) - Deployment options
