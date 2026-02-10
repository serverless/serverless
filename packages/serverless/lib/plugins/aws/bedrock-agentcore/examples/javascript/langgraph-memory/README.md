# LangGraph Memory Example

A LangGraph JavaScript agent with AgentCore Memory for conversation persistence.

## Features

- **Conversation Memory**: Persist and recall conversation history across invocations
- **Session Management**: Track conversations by session ID
- **Memory Expiration**: Configurable TTL (30 days in this example)
- **LangGraph JS**: ReAct agent with memory-enhanced context

## How It Works

1. On each invocation, the agent retrieves previous conversation history from AgentCore Memory
2. History is injected as system context for the LLM
3. After generating a response, the conversation turn is stored in memory
4. Subsequent invocations in the same session recall previous context

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

- [../python/langgraph-memory](../../python/langgraph-memory/) - Python version
