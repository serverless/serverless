# MCP Server Example

A JavaScript MCP server deployed to AWS Bedrock AgentCore Runtime. Exposes simple tools via the [Model Context Protocol](https://modelcontextprotocol.io/) that can be consumed by any MCP client (Cursor, Claude Desktop, Amazon Q CLI, etc.).

## Tools

| Tool | Description |
| --- | --- |
| `add` | Add two numbers together |
| `multiply` | Multiply two numbers together |
| `get_current_time` | Get the current date and time (with optional timezone) |

## Prerequisites

- Node.js 24.x
- AWS account with credentials configured
- Serverless Framework installed (`npm i -g serverless`)

## Project structure

```
mcp-server/
├── index.js          # MCP server (Express + @modelcontextprotocol/sdk)
├── package.json      # Dependencies and start script
├── serverless.yml    # Serverless Framework configuration
└── README.md
```

## Deploy

```bash
npm install
sls deploy
```

## Local development

```bash
npm install
sls dev
```

## How it works

The server uses Express to expose a stateless Streamable HTTP endpoint at `POST /mcp` on port 8000, which is the standard expected by AgentCore Runtime for MCP-protocol runtimes. Each request creates a fresh MCP server instance, processes the JSON-RPC message, and cleans up on close.

The `serverless.yml` sets `protocol: MCP` on the agent, which tells AgentCore to route MCP traffic to the runtime.

## Connecting MCP clients

Once deployed, the runtime can be connected to any MCP client that supports remote MCP servers via Streamable HTTP. Refer to the [AgentCore MCP documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.html) for invocation details and authentication setup.
