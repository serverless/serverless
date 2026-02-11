# LangGraph JS Example

A minimal LangGraph JavaScript agent deployed to AWS Bedrock AgentCore without a Dockerfile. The Serverless Framework automatically builds the container image from source code.

## Features

- **No Dockerfile needed**: Container image is built automatically from source code
- **LangGraph JS**: ReAct agent pattern with tool calling
- **Claude Sonnet 4.5**: Powered by Amazon Bedrock
- **Simple Tools**: Calculator operations
- **Minimal Configuration**: Just `ai: { agents: { assistant: {} } }` in `serverless.yml`

## How It Works

When no Dockerfile is found in the project directory, the Serverless Framework automatically builds the container image from your source code:

1. Node.js is detected from `package.json`
2. Dependencies are installed automatically via `npm install`
3. The image is built for ARM64

### Key Files

| File           | Purpose                                                         |
| -------------- | --------------------------------------------------------------- |
| `package.json` | Declares dependencies; `engines.node` specifies Node.js version |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker
- AWS credentials configured
- Serverless Framework CLI (`npm install -g serverless`)

### Install Dependencies

```bash
npm install
```

### Deploy to AWS

```bash
sls deploy
```

### Invoke Deployed Agent

```bash
# Via Serverless Framework CLI
sls invoke agent --agent assistant --data '{"prompt":"What is 25 multiplied by 4?"}'
```

### Remove

```bash
sls remove
```

## Project Structure

```
langgraph-basic/
├── serverless.yml    # Serverless Framework configuration
├── index.js          # LangGraph JS agent with tools
├── package.json      # npm dependencies
└── README.md         # This file
```

## Related Examples

- [langgraph-basic-dockerfile](../langgraph-basic-dockerfile/) - Same agent with a Dockerfile
- [mcp-server](../mcp-server/) - JavaScript MCP server
