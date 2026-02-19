<!--
title: Serverless Framework - AgentCore Gateway Configuration
description: Add custom tools to your AI agents using AgentCore Gateway -- Lambda functions, OpenAPI endpoints, Smithy models, or MCP servers
short_title: Gateway
keywords:
  [
    'Serverless Framework',
    'AWS Bedrock',
    'AgentCore',
    'Gateway',
    'Tools',
    'Lambda',
    'MCP',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/gateway)

<!-- DOCS-SITE-LINK:END -->

# Gateway Configuration

A Gateway exposes tools that AI agents can discover and invoke -- Lambda functions, OpenAPI endpoints, Smithy models, or external MCP servers. This allows agents to call your custom business logic, access databases, integrate with APIs, and more.

## Quick Start

Define tools in `ai.tools` and they become available to your agents automatically:

```yml
service: my-agent

provider:
  name: aws
  region: us-east-1

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
                description: Mathematical expression to evaluate (e.g., "2 + 2 * 3")
            required:
              - expression

  agents:
    chatbot: {}
```

The Serverless Framework automatically:

- Creates a default gateway with all tools attached
- Injects `BEDROCK_AGENTCORE_GATEWAY_URL` into your agent's environment
- Configures IAM permissions for tool invocation

## How It Works

When you define tools, the framework creates an AgentCore Gateway that:

1. **Discovers Tools**: Your agent receives a `BEDROCK_AGENTCORE_GATEWAY_URL` environment variable
2. **Exposes via MCP**: Tools are exposed using the Model Context Protocol (MCP)
3. **Invokes Target**: When the agent calls a tool, the gateway invokes the target (Lambda function, API endpoint, or MCP server)
4. **Returns Results**: Results flow back to the agent for processing

```
Agent → Gateway (MCP) → Target (Lambda / API / MCP Server) → Response
```

## Tool Types

### Lambda Function Tools

The most common tool type. Wrap your Lambda functions as agent tools:

```yml
functions:
  myFunction:
    handler: handler.main
    runtime: python3.13

ai:
  tools:
    myTool:
      function: myFunction
      toolSchema:
        - name: do_something
          description: Performs a specific action
          inputSchema:
            type: object
            properties:
              input:
                type: string
            required:
              - input
```

**Lambda Function Reference:**

| Format                                  | Description                         |
| --------------------------------------- | ----------------------------------- |
| `function: myFunction`                  | Reference to `functions.myFunction` |
| `function: { name: myFunction }`        | Explicit name reference             |
| `function: { arn: arn:aws:lambda:... }` | External Lambda ARN                 |

### OpenAPI Tools

Expose HTTP APIs as tools using OpenAPI specifications:

```yml
ai:
  tools:
    weatherApi:
      openapi: ./weather-openapi.yml
```

### Smithy Model Tools

Define tools using [Smithy](https://smithy.io/) interface definitions:

```yml
ai:
  tools:
    myApi:
      smithy: ./my-api.smithy
```

### MCP Server Tools

Connect to external MCP servers:

```yml
ai:
  tools:
    externalTool:
      mcp: https://my-mcp-server.example.com/mcp
```

## Tool Schema

The `toolSchema` defines how the agent understands and invokes your tool:

```yml
ai:
  tools:
    search:
      function: searchFunction
      toolSchema:
        - name: search_products
          description: Search the product catalog by query
          inputSchema:
            type: object
            properties:
              query:
                type: string
                description: Search query text
              category:
                type: string
                description: Optional product category filter
              maxResults:
                type: integer
                description: Maximum number of results (default 10)
            required:
              - query
```

| Property       | Required | Description                                          |
| -------------- | -------- | ---------------------------------------------------- |
| `name`         | Yes      | Tool name the agent uses to invoke it                |
| `description`  | Yes      | What the tool does (helps LLM decide when to use it) |
| `inputSchema`  | Yes      | JSON Schema defining input parameters                |
| `outputSchema` | No       | JSON Schema defining output parameters               |

## Tool Credentials

By default, tools use `GATEWAY_IAM_ROLE` credentials -- no extra configuration needed. For tools that need authentication when calling external APIs, configure OAuth or API Key credentials:

**OAuth Credentials:**

```yml
ai:
  tools:
    spotify:
      openapi: ./spotify-openapi.yml
      credentials:
        type: OAUTH
        provider: arn:aws:bedrock-agentcore:us-east-1:123456789012:token-vault/spotify
        grantType: AUTHORIZATION_CODE
        scopes:
          - playlist-read-private
        defaultReturnUrl: https://myapp.com/callback
        customParameters: # Optional: additional OAuth parameters
          access_type: offline
```

**API Key Credentials:**

```yml
ai:
  tools:
    weather:
      openapi: ./weather-api.yml
      credentials:
        type: API_KEY
        provider: arn:aws:bedrock-agentcore:us-east-1:123456789012:token-vault/weather-key
        location: HEADER
        parameterName: X-API-Key
        prefix: Bearer # Optional: value prefix (e.g., "Bearer" for Authorization header)
```

**Credential types:**

| Type               | Description                                        |
| ------------------ | -------------------------------------------------- |
| `GATEWAY_IAM_ROLE` | Default -- uses the gateway's IAM role (no config) |
| `OAUTH`            | OAuth 2.0 via AgentCore Token Vault                |
| `API_KEY`          | API key via AgentCore Token Vault                  |

## Multiple Gateways

For advanced scenarios where you need different authorization levels or tool subsets, define explicit gateways:

```yml
ai:
  tools:
    calculator:
      function: calculatorFunction
      toolSchema: [...]

    internalLookup:
      function: internalLookupFunction
      toolSchema: [...]

  gateways:
    publicGateway:
      authorizer: NONE
      tools:
        - calculator

    privateGateway:
      authorizer: AWS_IAM
      tools:
        - internalLookup

  agents:
    publicAgent:
      gateway: publicGateway

    privateAgent:
      gateway: privateGateway
```

### Gateway Authorization Options

| Type         | Description                    |
| ------------ | ------------------------------ |
| `NONE`       | No authentication required     |
| `AWS_IAM`    | AWS IAM authentication (SigV4) |
| `CUSTOM_JWT` | JWT token validation           |

**JWT Authorization:**

```yml
ai:
  gateways:
    secureGateway:
      authorizer:
        type: CUSTOM_JWT
        jwt:
          discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx/.well-known/openid-configuration
          allowedAudience:
            - my-client-id
          allowedScopes:
            - openid
      tools:
        - protectedTool
```

### Gateway Configuration Options

| Property         | Type          | Description                 |
| ---------------- | ------------- | --------------------------- |
| `authorizer`     | string/object | Authorization configuration |
| `tools`          | array         | Tool names to include       |
| `protocol`       | object        | Protocol settings (MCP)     |
| `description`    | string        | Gateway description         |
| `role`           | string/object | IAM role configuration      |
| `kmsKey`         | string        | KMS key ARN for encryption  |
| `exceptionLevel` | string        | `DEBUG` for verbose errors  |
| `tags`           | object        | Resource tags               |

### Protocol Configuration

Customize the MCP protocol settings for your gateway:

```yml
ai:
  gateways:
    myGateway:
      protocol:
        type: MCP
        instructions: 'Use the calculator tool for any mathematical operations'
        searchType: SEMANTIC
        supportedVersions:
          - '2025-11-25'
      tools:
        - calculator
```

| Property            | Required | Description                                          |
| ------------------- | -------- | ---------------------------------------------------- |
| `type`              | No       | Protocol type (default: `MCP`, only supported value) |
| `instructions`      | No       | Instructions for tool discovery (max 2048 chars)     |
| `searchType`        | No       | `SEMANTIC` for semantic tool matching                |
| `supportedVersions` | No       | Array of supported MCP protocol versions             |

## Using Gateway Tools in Your Agent

Your agent receives `BEDROCK_AGENTCORE_GATEWAY_URL` automatically. Use the MCP client to discover and call tools:

**Python:**

```python
import os
from mcp import ClientSession
from mcp.client.sse import sse_client

GATEWAY_URL = os.environ.get("BEDROCK_AGENTCORE_GATEWAY_URL")

async def get_gateway_tools():
    async with sse_client(GATEWAY_URL) as streams:
        async with ClientSession(*streams) as session:
            await session.initialize()
            tools = await session.list_tools()
            return tools.tools
```

**JavaScript:**

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

const GATEWAY_URL = process.env.BEDROCK_AGENTCORE_GATEWAY_URL

async function getGatewayTools() {
  const transport = new SSEClientTransport(new URL(GATEWAY_URL))
  const client = new Client({ name: 'my-agent', version: '1.0.0' })
  await client.connect(transport)
  const { tools } = await client.listTools()
  return tools
}
```

For complete implementations, see the gateway examples in the [Examples](#examples) section below.

## Examples

**JavaScript:**

- [LangGraph Gateway](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-gateway) - Basic gateway with Lambda tools
- [LangGraph Multi-Gateway](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-multi-gateway) - Multiple gateways with different authorization

**Python:**

- [LangGraph Gateway](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-gateway) - Basic gateway with Lambda tools
- [LangGraph Multi-Gateway](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-multi-gateway) - Multiple gateways with different authorization

## Next Steps

- [Memory Configuration](./memory.md) - Enable conversation persistence
- [Runtime Configuration](./runtime.md) - Configure agent deployment options
- [Browser Tool](./browser.md) - Web automation capabilities
- [Code Interpreter](./code-interpreter.md) - Python code execution
