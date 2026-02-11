# LangGraph Gateway Agent

A LangGraph agent demonstrating how to add custom Lambda function tools via AgentCore Gateway.

## What This Example Shows

- **Gateway Tools**: Exposing Lambda functions as agent tools
- **Auto-Created Gateway**: Default gateway created automatically when tools are defined
- **MCP Protocol**: Tool discovery and invocation via Model Context Protocol
- **BedrockAgentCoreApp**: Integration pattern for AgentCore Runtime
- **LangGraph**: Agent orchestration with tool nodes

## Architecture

```
User Request → AgentCore Runtime → agent_invocation()
                                      ↓
                                   LangGraph
                                      ↓
                               Claude Sonnet 4.5
                                      ↓
                         [needs calculation?]
                                      ↓
                    Gateway (MCP) → Calculator Lambda
                                      ↓
                                   Response
```

## Prerequisites

- AWS account with Bedrock model access (Claude Sonnet 4.5)
- Enable access to US inference profile `us.anthropic.claude-sonnet-4-5-20250929-v1:0` in Bedrock console
- Docker installed
- Serverless Framework v4+
- AWS credentials configured

## Quick Start

### 1. Deploy

```bash
serverless deploy
```

The framework will:

- Build the Docker image
- Push to Amazon ECR
- Deploy the Calculator Lambda function
- Create the AgentCore Gateway with the calculator tool
- Deploy AgentCore Runtime
- Output the invocation URL

### 2. Test

**Using boto3:**

```python
import boto3
import json
import uuid

client = boto3.client('bedrock-agentcore', region_name='us-east-1')

response = client.invoke_agent_runtime(
    agentRuntimeArn='YOUR_RUNTIME_ARN',  # From deploy output
    runtimeSessionId=str(uuid.uuid4()),
    payload=json.dumps({"prompt": "What is 25 multiplied by 4?"}).encode()
)

result = json.loads(response['response'].read())
print(result)
```

### 3. Local Development

```bash
serverless dev
```

## How It Works

### Configuration

The `serverless.yml` defines:

1. **Lambda Function**: The calculator handler
2. **Tool Definition**: Maps the Lambda to a gateway tool with schema
3. **Agent**: A minimal agent that receives the gateway URL automatically

```yml
functions:
  calculatorFunction:
    handler: handlers/calculator.handler
    runtime: python3.13

ai:
  tools:
    calculator:
      function: calculatorFunction
      toolSchema:
        - name: calculate
          description: Evaluate a mathematical expression
          inputSchema:
            type: object
            properties:
              expression:
                type: string
            required:
              - expression

  agents:
    chatbot: {} # Default gateway auto-created
```

### Tool Discovery

The agent discovers gateway tools at startup:

```python
GATEWAY_URL = os.environ.get("BEDROCK_AGENTCORE_GATEWAY_URL")

async with sse_client(GATEWAY_URL) as streams:
    async with ClientSession(*streams) as session:
        await session.initialize()
        tools = await session.list_tools()
```

### Tool Invocation

When the LLM decides to use a tool, LangGraph's ToolNode invokes it via the MCP client:

```python
result = await session.call_tool("calculate", {"expression": "25 * 4"})
```

## Files

| File                     | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `serverless.yml`         | Infrastructure configuration                |
| `agent.py`               | LangGraph agent with gateway tool discovery |
| `handlers/calculator.py` | Calculator Lambda function                  |
| `Dockerfile`             | Container definition                        |
| `pyproject.toml`         | Python dependencies                         |

## Adding More Tools

Define additional tools in `serverless.yml`:

```yml
functions:
  calculatorFunction:
    handler: handlers/calculator.handler
    runtime: python3.13

  weatherFunction:
    handler: handlers/weather.handler
    runtime: python3.13

ai:
  tools:
    calculator:
      function: calculatorFunction
      toolSchema: [...]

    weather:
      function: weatherFunction
      toolSchema:
        - name: get_weather
          description: Get current weather for a city
          inputSchema:
            type: object
            properties:
              city:
                type: string
            required:
              - city

  agents:
    chatbot: {}
```

## Cleanup

```bash
serverless remove
```

## Next Steps

- [LangGraph Multi-Gateway](../langgraph-multi-gateway/) - Multiple gateways with different authorization
- [LangGraph Memory](../langgraph-memory/) - Add conversation persistence
