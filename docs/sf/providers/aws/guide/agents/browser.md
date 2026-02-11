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

Browser enables your AI agents to navigate web pages, extract information, and interact with websites. AgentCore provides managed browser infrastructure that works with any agent framework — Strands Agents provides the most streamlined Python integration via `AgentCoreBrowser`, while JavaScript agents can use `PlaywrightBrowser` from the `bedrock-agentcore` SDK.

## Quick Start

The simplest way to add browser capabilities is using the AWS-managed default browser with Strands:

**Configuration (`serverless.yml`):**

```yml
service: my-browser-agent

provider:
  name: aws
  region: us-east-1

ai:
  agents:
    webAgent: {} # Auto-detects Dockerfile
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

1. **Agent Request**: Your agent calls the browser tool with navigation instructions
2. **AWS Infrastructure**: AgentCore manages browser sessions in isolated environments
3. **Web Interaction**: The browser navigates, clicks, extracts content as instructed
4. **Response**: Results flow back to your agent for processing

```
Agent → Browser Tool → AWS Browser Service → Website → Response
```

## Using Browser in JavaScript

The `bedrock-agentcore` SDK provides `PlaywrightBrowser` for browser automation in JavaScript agents.

### Basic Pattern

```javascript
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { PlaywrightBrowser } from 'bedrock-agentcore/browser/playwright'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const browser = new PlaywrightBrowser({ region: 'us-east-1' })

// Define browser tools wrapping PlaywrightBrowser methods
const navigate = tool(
  async ({ url }) => {
    await browser.navigate({ url, waitUntil: 'domcontentloaded' })
    return `Navigated to ${url}`
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL in the browser.',
    schema: z.object({ url: z.string().describe('The URL to navigate to') }),
  },
)

const getText = tool(
  async ({ selector }) => {
    const text = await browser.getText({ selector })
    return text || 'No text found'
  },
  {
    name: 'get_text',
    description: 'Extract text content from elements.',
    schema: z.object({ selector: z.string().describe('CSS selector') }),
  },
)

const screenshot = tool(
  async () => {
    const data = await browser.screenshot()
    return `Screenshot captured (${data.length} bytes)`
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page.',
    schema: z.object({}),
  },
)

// Create agent with browser tools
const model = new ChatBedrockConverse({
  model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  region: 'us-east-1',
})

const agent = createReactAgent({
  llm: model,
  tools: [navigate, getText, screenshot],
})

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({ prompt: z.string() }),
    async handler({ request }) {
      const result = await agent.invoke({
        messages: [{ role: 'user', content: request.prompt }],
      })
      return { response: result.messages.at(-1).content }
    },
  },
})

app.run()
```

**Dependencies (`package.json`):**

```json
{
  "dependencies": {
    "bedrock-agentcore": "^0.1.0",
    "@langchain/langgraph": "^0.2.0",
    "@langchain/aws": "^0.1.0",
    "@langchain/core": "^0.3.0",
    "zod": "^3.23.0"
  }
}
```

## Using Browser in Python (Strands Agents)

Strands provides the most streamlined Python integration with AgentCore Browser through `strands_tools.browser.AgentCoreBrowser`.

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

| Scenario                  | Recommendation                      |
| ------------------------- | ----------------------------------- |
| Basic web browsing        | Use AWS-managed default             |
| Need session recording    | Define custom browser               |
| Access VPC-only resources | Define custom browser with VPC mode |
| Require request signing   | Define custom browser with signing  |

### Basic Custom Browser

```yml
ai:
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
ai:
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
ai:
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

| Property      | Type          | Required | Description                               |
| ------------- | ------------- | -------- | ----------------------------------------- |
| `network`     | object        | No       | Network configuration (default: PUBLIC)   |
| `description` | string        | No       | Human-readable description (1-1200 chars) |
| `recording`   | object        | No       | Session recording configuration           |
| `signing`     | object        | No       | Request signing configuration             |
| `role`        | string/object | No       | IAM role ARN or configuration             |
| `tags`        | object        | No       | Resource tags                             |

### Network Configuration

| Property         | Type   | Required | Description        |
| ---------------- | ------ | -------- | ------------------ |
| `mode`           | string | Yes      | `PUBLIC` or `VPC`  |
| `subnets`        | array  | VPC only | VPC subnet IDs     |
| `securityGroups` | array  | VPC only | Security group IDs |

### Recording Configuration

| Property            | Type    | Required      | Description              |
| ------------------- | ------- | ------------- | ------------------------ |
| `enabled`           | boolean | No            | Enable session recording |
| `s3Location.bucket` | string  | If enabled    | S3 bucket for recordings |
| `s3Location.prefix` | string  | If s3Location | S3 key prefix            |

### Signing Configuration

| Property  | Type    | Required | Description            |
| --------- | ------- | -------- | ---------------------- |
| `enabled` | boolean | No       | Enable request signing |

## Session Recording

Session recording captures browser interactions for debugging and compliance:

**Use cases:**

- Debug failed browser automation
- Audit agent behavior for compliance
- Review extracted data accuracy
- Training and improvement analysis

**Configuration:**

```yml
ai:
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
ai:
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

**JavaScript:**

- [LangGraph Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-browser) - LangGraph with PlaywrightBrowser toolkit
- [LangGraph Browser Custom](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-browser-custom) - Custom browser with session recording
- [Strands Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/strands-browser) - Strands Agents with BrowserTools

**Python:**

- [LangGraph Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-browser) - LangChain/LangGraph with browser toolkit
- [LangGraph Browser Custom](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-browser-custom) - Custom browser with session recording
- [Strands Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/strands-browser) - Strands Agents with AgentCoreBrowser

## Next Steps

- [Code Interpreter](./code-interpreter.md) - Python code execution capabilities
- [Memory Configuration](./memory.md) - Conversation persistence
- [Gateway Configuration](./gateway.md) - Custom Lambda tools
- [Runtime Configuration](./runtime.md) - Deployment options
