# LangGraph JS Minimal Example

A minimal LangGraph JavaScript agent deployed to AWS Bedrock AgentCore using Serverless Framework.

## Features

- **LangGraph JS**: ReAct agent pattern with tool calling
- **Claude Sonnet 4.5**: Powered by Amazon Bedrock
- **Simple Tools**: Calculator operations and time queries
- **Docker Deployment**: Auto-detected Dockerfile for easy deployment

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for local development)
- AWS credentials configured
- Serverless Framework CLI (`npm install -g serverless`)

### Install Dependencies

```bash
npm install
```

### Local Development

Start the agent locally with hot reload:

```bash
sls dev
```

This will:
1. Build the Docker image
2. Start the container with AWS credentials injected
3. Open an interactive chat interface
4. Watch for file changes and auto-rebuild

Try these prompts:
- "What time is it?"
- "What time is it in Tokyo?"
- "Calculate 25 multiplied by 4"
- "Add 100 and 250, then divide the result by 7"

### Deploy to AWS

```bash
sls deploy
```

### Invoke Deployed Agent

```bash
# Via Serverless Framework CLI
sls invoke agent --agent assistant --data '{"prompt":"Hello! What can you help me with?"}'

# Or via curl (replace URL with your runtime URL from `sls agentcore info`)
curl -X POST https://your-runtime-url/invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello! What can you help me with?"}'
```

### Remove

```bash
sls remove
```

## Project Structure

```
langgraph-basic-dockerfile/
├── serverless.yml    # Serverless Framework configuration
├── agent.js          # LangGraph JS agent with tools
├── package.json      # npm dependencies
├── Dockerfile        # Container definition
└── README.md         # This file
```

## How It Works

### Agent Architecture

```
User Input
    │
    ▼
┌─────────────────┐
│  BedrockAgent   │
│    CoreApp      │◄─── HTTP Server (port 8080)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   LangGraph     │
│  ReAct Agent    │◄─── Alternates between LLM and tools
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│ Tools │ │ Claude│
│       │ │  LLM  │
└───────┘ └───────┘
```

### Tools Available

| Tool | Description |
|------|-------------|
| `get_current_time` | Get current date/time with optional timezone |
| `add` | Add two numbers |
| `multiply` | Multiply two numbers |
| `divide` | Divide two numbers |

### Configuration

The `serverless.yml` is intentionally minimal:

```yaml
service: langgraph-basic-dockerfile

provider:
  name: aws
  region: us-east-1

agents:
  assistant: {}
```

The Dockerfile is auto-detected, and default settings are applied:
- Protocol: HTTP
- Network: PUBLIC
- Port: 8080

## Customization

### Adding New Tools

Edit `agent.js` to add new tools:

```javascript
const myNewTool = tool(
  async ({ input }) => {
    // Tool implementation
    return `Result: ${input}`
  },
  {
    name: 'my_new_tool',
    description: 'Description for the LLM',
    schema: z.object({
      input: z.string().describe('Input parameter'),
    }),
  }
)

// Add to tools array
const tools = [getCurrentTime, add, multiply, divide, myNewTool]
```

### Changing the Model

Edit the model configuration in `agent.js`:

```javascript
const model = new ChatBedrockConverse({
  // Claude Sonnet 4.5
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  // Or use other models:
  // model: 'us.amazon.nova-2-lite-v1:0',
  // model: 'us.meta.llama3-70b-instruct-v1:0',
  region: process.env.AWS_REGION || 'us-east-1',
})
```

## Related Examples

- [langgraph-basic-docker](../../python/langgraph-basic-docker/) - Python version
- [langgraph-gateway](../../python/langgraph-gateway/) - Lambda functions as tools
