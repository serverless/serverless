# LangGraph JS Streaming Example

A LangGraph JavaScript agent with real-time LLM token streaming deployed to AWS Bedrock AgentCore. Tokens are streamed to the client via Server-Sent Events (SSE) as they are generated, instead of waiting for the full response.

## Features

- **LLM Token Streaming**: Tokens streamed in real-time via SSE as the model generates them
- **Async Generator Pattern**: Uses `async function*` with `yield` for streaming through BedrockAgentCoreApp
- **No Dockerfile needed**: Container image is built automatically from source code
- **LangGraph JS**: ReAct agent pattern with tool calling
- **Claude Sonnet 4.5**: Powered by Amazon Bedrock
- **Simple Tools**: Calculator operations and time queries

## How It Works

The key difference from the non-streaming [langgraph-basic](../langgraph-basic/) example is how the `process` handler works:

**Non-streaming** (langgraph-basic): `process` is an `async` function that `return`s the complete response after the agent finishes.

**Streaming** (this example): `process` is an `async function*` (async generator) that `yield`s each LLM token as it is produced.

```javascript
async *process(request, context) {
  const stream = await agent.stream(
    { messages: [{ role: 'user', content: request.prompt }] },
    { streamMode: 'messages' },
  )

  for await (const [message, metadata] of stream) {
    if (
      message._getType() === 'ai' &&
      message.content &&
      typeof message.content === 'string'
    ) {
      yield message.content
    }
  }
}
```

The BedrockAgentCoreApp runtime automatically detects the async generator and streams each yielded value to the client as an SSE event.

### LangGraph Stream Modes

LangGraph supports three streaming modes (see [LangGraph streaming docs](https://langchain-ai.github.io/langgraphjs/how-tos/#streaming)):

| Mode       | Description                                     | Use Case                                     |
| ---------- | ----------------------------------------------- | -------------------------------------------- |
| `messages` | Stream individual LLM tokens                    | Real-time text output (used in this example) |
| `updates`  | Emit events after each graph node               | Agent progress tracking                      |
| `custom`   | Emit custom data from tools via `config.writer` | Tool progress updates                        |

This example uses `streamMode: "messages"` for token-level streaming.

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
sls invoke agent --agent assistant --data '{"prompt":"Write a haiku about streaming data."}'
```

### Test Streaming Locally

```bash
RUNTIME_ARN=<your-runtime-arn> node test-invoke.js
```

### Remove

```bash
sls remove
```

## Project Structure

```
langgraph-streaming/
├── serverless.yml    # Serverless Framework configuration
├── index.js          # LangGraph JS agent with streaming
├── package.json      # npm dependencies
├── test-invoke.js    # Test script for streaming invocation
└── README.md         # This file
```

## Related Examples

- [langgraph-basic](../langgraph-basic/) - Same agent without streaming (returns complete response)
- [langgraph-basic-dockerfile](../langgraph-basic-dockerfile/) - Non-streaming agent with a Dockerfile
