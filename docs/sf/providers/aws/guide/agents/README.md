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

AWS Bedrock AgentCore is a fully managed service for deploying AI agents with memory, custom tools, web browsing, and code execution capabilities. The Serverless Framework provisions and manages AgentCore infrastructure alongside your Lambda functions.

## Quick Start

Deploy your first AI agent with three components:

**1. Configuration (`serverless.yml`):**

```yml
service: my-ai-agent

provider:
  name: aws
  region: us-east-1

agents:
  chatbot: {}
```

The framework auto-detects the `Dockerfile` and handles the build, push to ECR, and deployment.

> **Note**: Use `{}` for an empty agent configuration. YAML requires explicit empty braces.

**2. Agent code (`agent.py`):**

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()

@app.entrypoint
def agent_invocation(payload, context):
    # Your agent logic (LangGraph, Strands, etc.)
    user_message = payload.get("prompt")
    result = your_agent.invoke(user_message)
    return {"result": result}

app.run()
```

**3. Container (`Dockerfile`):**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "agent.py"]
```

**Deploy:**

```bash
serverless deploy
```

**See full examples:**
- [Docker deployment](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-basic-docker) - Container-based (any language)
- [Code deployment](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-basic-code) - Python with automatic packaging

## Deployment Options

AgentCore supports two deployment methods:

### Docker/Image Deployment

Use any language and framework. The framework **auto-detects** your `Dockerfile`:

```yml
agents:
  myAgent: {}  # Minimal - auto-detects Dockerfile
```

Add optional configuration as needed:

```yml
agents:
  myAgent:
    environment:
      MODEL_ID: us.anthropic.claude-sonnet-4-5-20250929-v1:0
    lifecycle:
      idleRuntimeSessionTimeout: 900  # seconds (60-28800)
      maxLifetime: 3600  # seconds (60-28800)
```

**Best for:** Multi-language projects, complex dependencies, full control

### Code Deployment (Python Only)

Deploy Python code directly without Docker:

```yml
agents:
  myAgent:
    handler: agent.main  # Triggers code deployment mode
    runtime: PYTHON_3_13  # or PYTHON_3_10, PYTHON_3_11, PYTHON_3_12
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

## Prerequisites

- AWS account with [Bedrock model access](https://console.aws.amazon.com/bedrock/home#/modelaccess)
- Docker installed (for image deployment)
- Serverless Framework v4+

## Configuration Reference

### Basic Runtime

```yml
agents:
  myAgent:
    # Deployment method (choose one)
    artifact:
      image: # Docker deployment
    # OR
    handler: agent.main  # Code deployment
    runtime: PYTHON_3_12

    # Optional configuration
    environment:
      MODEL_ID: anthropic.claude-sonnet-4-5-20250929-v1:0
    lifecycle:
      idleRuntimeSessionTimeout: 900  # seconds (60-28800)
      maxLifetime: 3600  # seconds (60-28800)
    tags:
      team: ai
      project: chatbot
```

### With Memory

```yml
agents:
  memory:
    conversations:
      expiration: 30  # days
      strategies:
        - type: semantic

  myAgent:
    memory: conversations  # Reference memory by name
```

**Learn more:** [Memory Configuration](./memory.md)

### With Gateway (Custom Tools)

```yml
agents:
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

  myAgent:
    gateway: default  # Reference gateway by name
```

**Learn more:** [Gateway Configuration](./gateway.md)

## Development & Testing

Test your agents locally and remotely:

```bash
# Local development mode (runs agent in Docker locally)
serverless dev

# Invoke deployed agent
serverless invoke --function myAgent --data '{"prompt": "Hello!"}'

# View deployment info
serverless info
```

## Examples

- **Basic Agent** - LangGraph with simple tools
  - [Docker deployment](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-basic-docker) - Container-based (any language)
  - [Code deployment](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-basic-code) - Python with auto-packaging
- **Memory** - Conversation persistence
  - [LangGraph with Memory](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-memory) - Persist conversations across invocations

## Next Steps

- [Runtime Configuration](./runtime.md) - Deployment, networking, authentication
- [Gateway Integration](./gateway.md) - Add custom tools to your agents
- [Memory Strategies](./memory.md) - Enable conversation context
- [Browser Tool](./browser.md) - Web automation capabilities
- [Code Interpreter](./code-interpreter.md) - Python code execution
