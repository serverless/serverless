# LangGraph Browser Example

A LangGraph JavaScript agent with AWS-managed browser capabilities deployed to Bedrock AgentCore.

## Features

- **Browser Automation**: Navigate, click, type, extract text, take screenshots
- **LangGraph JS**: ReAct agent pattern with browser tools
- **Claude Sonnet 4.5**: Powered by Amazon Bedrock
- **Minimal Configuration**: Just `agents: { browserAgent: {} }` in `serverless.yml`

## Tools Available

| Tool               | Description                             |
| ------------------ | --------------------------------------- |
| `navigate`         | Navigate to a URL                       |
| `click`            | Click an element by CSS selector        |
| `type_text`        | Type text into an input element         |
| `get_text`         | Extract text from the page or element   |
| `get_html`         | Get HTML content of the page or element |
| `screenshot`       | Take a screenshot                       |
| `evaluate`         | Execute JavaScript in the page          |
| `wait_for_element` | Wait for an element to appear           |

## Quick Start

### Prerequisites

- Node.js 24+
- AWS credentials configured
- Serverless Framework CLI

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

- [langgraph-browser-custom](../langgraph-browser-custom/) - Custom browser with session recording
- [strands-browser](../strands-browser/) - Browser with Strands Agents framework
