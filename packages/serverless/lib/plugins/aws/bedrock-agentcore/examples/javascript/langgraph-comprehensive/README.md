# LangGraph Comprehensive Agent

A LangGraph agent demonstrating multiple AgentCore capabilities in a single deployment: custom Lambda tools, a direct MCP server connection, web browsing, code execution, and conversation memory.

## What This Example Shows

- **Gateway Tools**: Lambda function (calculator) via AgentCore Gateway
- **Direct MCP Server**: AWS Knowledge MCP connected directly from agent code (public endpoint, no gateway needed)
- **Default Browser**: Web navigation and content extraction via `PlaywrightBrowser`
- **Default Code Interpreter**: Sandboxed code execution via `CodeInterpreter`
- **Memory**: Conversation persistence with `list_events` tool and automatic saving
- **Auto-build**: No Dockerfile needed -- the framework builds the image from source via buildpacks
- **`agents/` directory**: Agent code lives in `agents/index.js`, not the project root

## Architecture

```
User Request --> AgentCore Runtime --> agents/index.js
                                        |
                                    LangGraph ReAct Agent
                                        |
                                    Claude Sonnet
                                        |
        +----------+----------+----------+----------+------+
        |          |          |          |          |      |
   Gateway MCP  Direct MCP  Browser  Code Interp. Memory Direct
        |          |                                      Response
   Calculator  AWS Knowledge
   (Lambda)    (public MCP)
```

## Prerequisites

- AWS account with Bedrock model access (Claude Sonnet)
- Enable `us.anthropic.claude-sonnet-4-5-20250929-v1:0` in the [Bedrock console](https://console.aws.amazon.com/bedrock/home#/modelaccess)
- Docker installed
- Serverless Framework v4+
- AWS credentials configured

## Quick Start

### 1. Deploy

```bash
serverless deploy
```

The framework will:

- Auto-build a Docker image from source (no Dockerfile needed)
- Push to Amazon ECR
- Deploy the Calculator Lambda function
- Create an AgentCore Gateway with the calculator tool
- Create AgentCore Memory (30-day expiration)
- Deploy AgentCore Runtime

### 2. Test

```bash
RUNTIME_ARN=<your-runtime-arn> node test-invoke.js
```

Get the runtime ARN from `serverless info`.

### 3. Local Development

```bash
serverless dev
```

## How It Works

### Configuration

The `serverless.yml` defines a calculator Lambda tool in the gateway:

```yml
ai:
  tools:
    calculator:
      function: calculatorFunction # Lambda tool via gateway
      toolSchema: [...]

  agents:
    assistant:
      memory:
        expiration: 30
```

The calculator tool is automatically placed in an auto-created default gateway. The AWS Knowledge MCP server is connected directly from the agent code (no gateway needed).

### Tool Sources

The agent in `agents/index.js` combines six tool sources:

1. **Gateway tools** -- calculator Lambda discovered via `BEDROCK_AGENTCORE_GATEWAY_URL` using MCP protocol with SigV4 auth
2. **Direct MCP tools** -- AWS Knowledge MCP server (`https://knowledge-mcp.global.api.aws`) connected directly (public endpoint, no auth)
3. **Browser tools** -- `PlaywrightBrowser` wrapped as LangChain tools (navigate, get_text, click, screenshot)
4. **Code interpreter tools** -- `CodeInterpreter` wrapped as LangChain tools (execute_code, execute_command)
5. **Memory tool** -- `list_events` using `ListEventsCommand` from the AWS SDK
6. **Memory saving** -- automatic `CreateEventCommand` after each response

All tools are merged and passed to `createReactAgent`, which lets Claude decide which tool to use.

### Auto-build

With no Dockerfile present, the framework uses Heroku buildpacks to build the image. It reads `package.json` and uses the `scripts.start` field (`node agents/index.js`) as the entry point.

Requirements for auto-build:

- `package.json` with a `start` script
- A lockfile (`package-lock.json`)

## Files

| File                     | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `serverless.yml`         | Infrastructure configuration                 |
| `agents/index.js`        | LangGraph agent combining all tool sources   |
| `handlers/calculator.js` | Calculator Lambda function (gateway tool)    |
| `package.json`           | Dependencies and start script for auto-build |
| `test-invoke.js`         | Test script exercising each tool type        |

## Cleanup

```bash
serverless remove
```

## Related Examples

- [LangGraph Gateway](../langgraph-gateway/) -- Gateway tools only
- [LangGraph Browser](../langgraph-browser/) -- Browser only
- [LangGraph Code Interpreter](../langgraph-code-interpreter/) -- Code interpreter only
- [LangGraph Memory](../langgraph-memory/) -- Memory only
- [LangGraph Multi-Gateway](../langgraph-multi-gateway/) -- Multiple gateways with different authorization
