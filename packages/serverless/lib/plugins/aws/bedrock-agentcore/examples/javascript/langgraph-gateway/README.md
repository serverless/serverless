# LangGraph Gateway Example

A LangGraph JavaScript agent with Lambda-backed tools exposed via an AgentCore Gateway using MCP protocol.

## Features

- **Gateway Tools**: Lambda functions exposed as agent tools via MCP
- **SigV4 Authentication**: Secure AWS IAM authentication for gateway access
- **Tool Discovery**: Automatic tool discovery from gateway endpoint
- **LangGraph JS**: StateGraph with ToolNode and conditional routing

## How It Works

1. Lambda function (`calculatorFunction`) is deployed as a standard AWS Lambda
2. The Serverless Framework creates a Gateway with the tool schema
3. The agent discovers tools at runtime via `BEDROCK_AGENTCORE_GATEWAY_URL`
4. MCP protocol is used to invoke tools through the gateway

## Quick Start

### Deploy

```bash
npm install
sls deploy
```

### Test

```bash
RUNTIME_ARN=<your-runtime-arn> node test-invoke.js
```

### Remove

```bash
sls remove
```

## Related Examples

- [langgraph-multi-gateway](../langgraph-multi-gateway/) - Multiple gateways with different auth
- [../python/langgraph-gateway](../../python/langgraph-gateway/) - Python version
