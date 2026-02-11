<!--
title: Serverless Framework - AWS Bedrock AgentCore
description: Deploy AI agents with AWS Bedrock AgentCore using the Serverless Framework
short_title: AI Agents
keywords:
  [
    'Serverless Framework',
    'AWS Bedrock',
    'AgentCore',
    'AI Agents',
    'LangGraph',
    'Memory',
    'Gateway',
    'Browser Tool',
    'Code Interpreter',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents)

<!-- DOCS-SITE-LINK:END -->

# AI Agents

AWS Bedrock AgentCore is a fully managed service for deploying AI agents built with any framework -- LangGraph, Strands Agents, CrewAI, or your own custom code. It provides memory, custom tools, web browsing, and code execution capabilities. The Serverless Framework provisions and manages AgentCore infrastructure alongside your Lambda functions.

## Quick Start

Deploy your first AI agent with a minimal configuration and your agent code.

**1. Configuration (`serverless.yml`):**

```yml
service: my-ai-agent

provider:
  name: aws
  region: us-east-1

ai:
  agents:
    chatbot: {}
```

> **Note**: Use `{}` for an empty agent configuration. YAML requires explicit empty braces.

**2. Agent code:**

**JavaScript (`index.js`):**

```javascript
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { z } from 'zod'

// Your agent setup - use any framework (LangGraph, Strands Agents, CrewAI, etc.)
const agent = createYourAgent()

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({
      prompt: z.string(),
    }),
    async process(request) {
      // Your agent logic
      const result = await agent.invoke(request.prompt)
      return result
    },
  },
})

app.run()
```

**Python (`agent.py`):**

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp

# Your agent setup - use any framework (LangGraph, Strands Agents, CrewAI, etc.)
agent = create_your_agent()

app = BedrockAgentCoreApp()

@app.entrypoint
def agent_invocation(payload, context):
    # Your agent logic
    result = agent.invoke(payload.get("prompt"))
    return {"result": result}

app.run()
```

**3. Deploy:**

```bash
serverless deploy
```

The Framework automatically builds a Docker image from your source code, pushes it to ECR, and deploys the agent. No Dockerfile is needed.

**See full examples:**

- JavaScript: [Auto-build](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-basic) · [Dockerfile](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-basic-dockerfile)
- Python: [Docker deployment](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-basic-docker) · [Code deployment](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-basic-code)

## What the Framework Manages

When you run `serverless deploy`, the Framework automatically handles:

- **Docker image builds** - Builds from your Dockerfile or automatically from source code, pushes to ECR
- **IAM roles** - Creates least-privilege execution roles for each agent component (runtime, memory, gateway, browser, code interpreter)
- **CloudFormation resources** - Provisions Runtime, Endpoint, Gateway, Memory, Browser, and Code Interpreter resources
- **Environment variables** - Injects memory IDs, gateway URLs, and other references into your agent's environment
- **Code packaging** - For Python code deployment, packages and uploads code to S3

You write the agent logic and `serverless.yml` configuration; the Framework handles the infrastructure.

## Deployment Options

AgentCore supports three deployment methods:

### Auto-build (No Dockerfile)

The simplest option. The Framework automatically builds a Docker image from your source code:

```yml
ai:
  agents:
    myAgent: {} # No Dockerfile needed
```

**Requirements for auto-build:**

For **Node.js** projects:

- `package.json` - required
- A lockfile - required (`package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`)
- Entry point: `index.js` or `server.js` in project root, or a `start` script in `package.json`
- Node.js version: set via `engines.node` in `package.json` (defaults to latest LTS)

For **Python** projects:

- `requirements.txt` or `pyproject.toml` - required for dependency installation

**Best for:** Getting started quickly, simple projects

### Dockerfile Deployment

Provide your own Dockerfile for full control. The Framework auto-detects it:

```yml
ai:
  agents:
    myAgent: {} # Auto-detects Dockerfile in project directory
```

**Node.js Dockerfile:**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "index.js"]
```

**Python Dockerfile:**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "agent.py"]
```

Add optional configuration as needed:

```yml
ai:
  agents:
    myAgent:
      environment:
        MODEL_ID: us.anthropic.claude-sonnet-4-5-20250929-v1:0
      lifecycle:
        idleRuntimeSessionTimeout: 900 # seconds (60-28800)
        maxLifetime: 3600 # seconds (60-28800)
```

**Best for:** Multi-language projects, complex dependencies, full control over the container

### Code Deployment (Python Only)

Deploy Python code directly without Docker:

```yml
ai:
  agents:
    myAgent:
      handler: agent.main # Triggers code deployment mode
      runtime: python3.13 # or python3.10, python3.11, python3.12
      environment:
        MODEL_ID: us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

**Best for:** Simple Python agents, faster iterations, no Docker setup

## Core Concepts

AgentCore provides infrastructure components that you reference in your agent code:

- **[Runtime](./runtime.md)** - Your deployed agent application (Docker or Python)
- **[Gateway](./gateway.md)** - Converts Lambda/APIs/MCP servers into agent tools
- **[Memory](./memory.md)** - Conversation persistence and context management
- **[Browser](./browser.md)** - Managed web automation capabilities
- **[Code Interpreter](./code-interpreter.md)** - Secure Python code execution
- **[Dev Mode](./dev.md)** - Local development with hot reload

## Prerequisites

- AWS account with [Bedrock model access](https://console.aws.amazon.com/bedrock/home#/modelaccess)
- Docker installed (for image deployment and auto-build)
- Node.js 20+ (for JavaScript agents)
- Serverless Framework v4+

## Configuration Reference

### Basic Runtime

```yml
ai:
  agents:
    myAgent:
      # Deployment method (choose one)
      artifact:
        image: # Docker deployment
      # OR
      handler: agent.main # Code deployment
      runtime: python3.12

      # Optional configuration
      environment:
        MODEL_ID: us.anthropic.claude-sonnet-4-5-20250929-v1:0
      lifecycle:
        idleRuntimeSessionTimeout: 900 # seconds (60-28800)
        maxLifetime: 3600 # seconds (60-28800)
      tags:
        team: ai
        project: chatbot
```

### With Memory

```yml
ai:
  memory:
    conversations:
      expiration: 30 # days
      strategies:
        - type: semantic

  agents:
    myAgent:
      memory: conversations # Reference memory by name
```

**Learn more:** [Memory Configuration](./memory.md)

### With Gateway (Custom Tools)

```yml
ai:
  tools:
    calculator:
      function:
        name: calculatorFunction
      toolSchema:
        - name: calculate
          description: Perform calculations
          parameters:
            expression:
              type: string

  gateways:
    default:
      tools:
        - calculator

  agents:
    myAgent:
      gateway: default # Reference gateway by name
```

**Learn more:** [Gateway Configuration](./gateway.md)

## Development & Testing

```bash
# Local development mode - runs agent locally with hot reload
serverless dev

# Invoke a deployed agent
serverless invoke --agent myAgent --data '{"prompt": "Hello!"}'

# View deployment info
serverless info
```

`serverless dev` runs your agent locally in Docker, injects AWS credentials, watches for file changes, and provides an interactive chat CLI. See [Dev Mode](./dev.md) for details.

`serverless invoke --agent` supports `--data`, `--path` (file input), and `--session-id` (for multi-turn conversations).

## Examples

### Basic Agent

LangGraph with simple tools:

- JavaScript: [Auto-build](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-basic) · [Dockerfile](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-basic-dockerfile)
- Python: [Docker](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-basic-docker) · [Code deployment](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-basic-code)

### Streaming

Real-time token streaming via SSE:

- JavaScript: [LangGraph Streaming](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-streaming)

### Memory

Conversation persistence across invocations:

- JavaScript: [LangGraph Memory](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-memory)
- Python: [LangGraph Memory](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-memory)

### Gateway (Custom Tools)

Connect Lambda functions and APIs as agent tools:

- JavaScript: [LangGraph Gateway](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-gateway) · [Multi-Gateway](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-multi-gateway)
- Python: [LangGraph Gateway](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-gateway) · [Multi-Gateway](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-multi-gateway)

### Browser

Web automation and content extraction:

- JavaScript: [LangGraph Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-browser) · [Custom Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-browser-custom) · [Strands Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/strands-browser)
- Python: [LangGraph Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-browser) · [Custom Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-browser-custom) · [Strands Browser](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/strands-browser)

### Code Interpreter

Secure Python code execution:

- JavaScript: [LangGraph Code Interpreter](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-code-interpreter) · [Custom Code Interpreter](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-code-interpreter-custom)
- Python: [LangGraph Code Interpreter](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-code-interpreter) · [Custom Code Interpreter](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-code-interpreter-custom)

### MCP Server

Deploy an MCP server as an AgentCore runtime:

- JavaScript: [MCP Server](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/mcp-server)

## Next Steps

- [Runtime Configuration](./runtime.md) - Deployment, networking, authentication
- [Gateway Integration](./gateway.md) - Add custom tools to your agents
- [Memory Strategies](./memory.md) - Enable conversation context
- [Browser Tool](./browser.md) - Web automation capabilities
- [Code Interpreter](./code-interpreter.md) - Python code execution
- [Dev Mode](./dev.md) - Local development workflow
