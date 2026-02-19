# Strands Browser Example

A Strands Agents JavaScript agent with AgentCore Browser for web automation.

## Features

- **Strands Agents SDK**: Uses `@strands-agents/sdk` instead of LangGraph
- **Ready-made Browser Tools**: Uses `BrowserTools` from `bedrock-agentcore/experimental/browser/strands`
- **Conversation Management**: Sliding window conversation manager for token efficiency
- **Tool Consent Bypass**: Automated execution via `BYPASS_TOOL_CONSENT`

## How It Differs from LangGraph Browser

| Aspect        | LangGraph Browser        | Strands Browser           |
| ------------- | ------------------------ | ------------------------- |
| Framework     | LangGraph JS             | Strands Agents SDK        |
| Tool setup    | Manual `tool()` wrappers | Ready-made `BrowserTools` |
| Agent pattern | ReAct agent              | Native Strands agent      |
| Streaming     | Non-streaming response   | Supports streaming        |

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

- [langgraph-browser](../langgraph-browser/) - LangGraph version with manual tool wrappers
- [langgraph-browser-custom](../langgraph-browser-custom/) - Custom browser with session recording
