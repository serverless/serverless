<!--
title: Serverless Framework - AgentCore Dev Mode
description: Local development mode for AI agents with hot reload, credential management, and interactive chat
short_title: Dev Mode
keywords:
  [
    'Serverless Framework',
    'AgentCore',
    'Dev Mode',
    'Local Development',
    'Hot Reload',
    'Docker',
    'Interactive Chat',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/dev)

<!-- DOCS-SITE-LINK:END -->

# Dev Mode

Run your AI agent locally with automatic AWS credential management, hot reload, and an interactive chat interface.

```bash
serverless dev
```

Dev mode runs your agent on your local machine while using the deployed IAM role for AWS permissions. This lets you
iterate on agent code without redeploying, while still accessing all deployed AWS resources (gateway tools, memory,
Bedrock models, etc.).

## Quick Start

**1. Deploy your agent first** (creates the IAM role and cloud resources):

```bash
serverless deploy
```

**2. Start dev mode:**

```bash
serverless dev
```

**3. Chat with your agent** -- once the agent is ready, you'll see:

```text
Dev mode running on http://localhost:8080

Session ID: a1b2c3d4-...
Type your message and press Enter to chat with the agent.
Press Ctrl+C to stop.

You: What can you help me with?

Agent:
I'm an AI assistant that can help you with...

You:
```

Edit your agent code, save the file, and dev mode automatically rebuilds and restarts.

## How It Works

When you run `serverless dev`, the framework:

1. **Fetches deployed resources** from CloudFormation -- IAM role ARN, gateway URL, memory ID
2. **Configures IAM trust policy** -- automatically adds your local identity to the role's trust policy so you can
   assume it
3. **Obtains temporary credentials** -- calls STS AssumeRole to get 60-minute credentials
4. **Detects the execution mode** -- Docker or Code, based on your project configuration
5. **Starts the agent locally** -- Docker container or Python process, with credentials and environment variables
   injected
6. **Watches for file changes** -- rebuilds/restarts automatically when source files change
7. **Starts interactive chat** -- readline CLI with streaming response support

```text
serverless dev
    │
    ├── Read CloudFormation stack outputs (Role ARN, Gateway URL, Memory ID)
    ├── Update IAM trust policy for local AssumeRole
    ├── Get STS temporary credentials (60 min)
    │
    ├── [Docker Mode] Build image → Run container on port 8080
    │   OR
    ├── [Code Mode] Spawn Python process on PORT
    │
    ├── Start file watcher
    └── Start interactive chat CLI
            │
            ├── User types message
            ├── HTTP POST http://localhost:8080/invocations
            ├── Agent responds (SSE stream or JSON)
            └── Display response
```

Your agent runs locally and calls AWS services directly using the injected temporary credentials -- there is no tunnel or cloud proxy.

## Command Options

```bash
# Auto-detects the first runtime agent
serverless dev

# Specify which agent to run (required when multiple agents are defined)
serverless dev --agent myAgent

# Use a custom port (default: 8080)
serverless dev --port 9000

# Force agents dev mode (see note below)
serverless dev --agents
```

### The `--agents` flag

When your `serverless.yml` defines **both** Lambda functions and agents, `serverless dev` defaults to Lambda functions
dev mode. Use `--agents` to explicitly select agents dev mode:

```bash
# This runs Lambda dev mode (default when functions exist)
serverless dev

# This runs agents dev mode
serverless dev --agents
```

If your configuration only has agents (no functions), agents dev mode is selected automatically.

## Execution Modes

Dev mode supports two execution modes, detected automatically based on your project configuration.

### Mode Detection Priority

| Priority | Condition                                | Mode               |
| -------- | ---------------------------------------- | ------------------ |
| 1        | `artifact.image` is configured           | Docker             |
| 2        | `handler` is set (no image or S3 config) | Code (Python only) |
| 3        | `Dockerfile` exists in project root      | Docker             |
| 4        | Default (image auto-creation)            | Docker             |

### Docker Mode

Builds a Docker image locally and runs it in a container. This is the default mode for most projects.

```yml
ai:
  agents:
    myAgent: {} # Dockerfile auto-detected
```

- Builds image as `<service>-<agent>:local`
- Maps container port 8080 to the host port
- Watches the Dockerfile directory for changes
- Rebuilds the container on file changes
- Closest match to production behavior

### Code Mode (Python Only)

Runs the Python process directly without Docker. Faster startup and iteration, ideal for rapid development.

```yml
ai:
  agents:
    myAgent:
      handler: agent.py
      runtime: python3.13
```

- Spawns the Python process directly from the project directory
- Only watches `.py` files for changes
- Restarts the Python process on changes
- Virtual environment recommended for credential isolation

**Important:** Your handler must read the `PORT` environment variable:

```python
if __name__ == "__main__":
  port = int(os.getenv('PORT', 8080))
  app.run(port=port, host='0.0.0.0')
```

## Resource Auto-Discovery

Dev mode automatically discovers deployed cloud resources from your CloudFormation stack and injects them as environment
variables. This means your local agent connects to the same gateway tools, memory, and other resources as the deployed
version.

| Resource    | Environment Variable            | When Injected                        |
| ----------- | ------------------------------- | ------------------------------------ |
| Gateway URL | `BEDROCK_AGENTCORE_GATEWAY_URL` | If gateway/tools are deployed        |
| Memory ID   | `BEDROCK_AGENTCORE_MEMORY_ID`   | If memory is configured on the agent |

This happens automatically -- no manual configuration needed. When you run `serverless dev`, the framework reads the
CloudFormation stack outputs and injects the values.

## Credentials

Dev mode manages AWS credentials automatically through the deployed IAM role.

### How It Works

1. **Trust policy setup** -- Dev mode adds a `ServerlessAgentCoreLocalDevPolicy` statement to the agent's IAM role trust
   policy, allowing your local AWS identity to assume the role. This handles SSO sessions, assumed roles, and regular
   IAM users.

2. **STS AssumeRole** -- Obtains temporary credentials (AccessKeyId, SecretAccessKey, SessionToken) with 60-minute
   expiration.

3. **Auto-refresh** -- When credentials have less than 10 minutes remaining and a file change triggers a rebuild,
   credentials are automatically refreshed.

4. **Retry logic** -- Credential acquisition retries up to 10 times with exponential backoff, handling IAM propagation
   delays.

### Credential Isolation (Code Mode)

For Python code mode, a virtual environment is strongly recommended:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
serverless dev
```

This prevents boto3 from reading your system `~/.aws/config` or SSO cache, ensuring the agent uses only the injected
temporary credentials. Dev mode detects the virtual environment automatically via the `VIRTUAL_ENV` environment
variable.

## Environment Variables

Dev mode injects the following environment variables into your agent process/container:

### Always Injected

| Variable                | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `AWS_ACCESS_KEY_ID`     | Temporary STS credentials                                    |
| `AWS_SECRET_ACCESS_KEY` | Temporary STS credentials                                    |
| `AWS_SESSION_TOKEN`     | Temporary STS credentials                                    |
| `AWS_REGION`            | From provider configuration                                  |
| `AWS_DEFAULT_REGION`    | Same as `AWS_REGION`                                         |
| `AGENTCORE_DEV_MODE`    | Always `'true'` -- use to detect dev mode in your agent code |
| `PYTHONUNBUFFERED`      | Always `'1'` -- ensures real-time log output                 |
| `SLS_SERVICE`           | Service name from `serverless.yml`                           |
| `SLS_STAGE`             | Current stage                                                |
| `SLS_AGENT`             | Agent name                                                   |

### Mode-Specific

| Variable | Mode      | Description                               |
| -------- | --------- | ----------------------------------------- |
| `PORT`   | Code only | Port number your handler should listen on |

### Auto-Discovered (If Deployed)

| Variable                        | Description          |
| ------------------------------- | -------------------- |
| `BEDROCK_AGENTCORE_GATEWAY_URL` | Gateway endpoint URL |
| `BEDROCK_AGENTCORE_MEMORY_ID`   | Memory resource ID   |

### User-Defined

Any variables defined in `environment` in your `serverless.yml` are also injected:

```yml
ai:
  agents:
    myAgent:
      environment:
        MODEL_ID: us.anthropic.claude-sonnet-4-20250514-v1:0
        MY_API_KEY: ${ssm:/my/api/key}
```

## Interactive Chat

Dev mode provides a built-in CLI for chatting with your local agent.

- **Prompt**: Type messages at the `You: ` prompt
- **Streaming**: Responses stream in real-time via Server-Sent Events (SSE)
- **Sessions**: Each dev mode start creates a new session ID (UUID). Sessions reset when files change and the agent
  rebuilds.
- **Exit**: Press `Ctrl+C` for graceful shutdown (stops container/process, cleans up)

### Invocation Protocol

The chat CLI sends HTTP POST requests to your local agent:

```text
POST http://localhost:<port>/invocations
Content-Type: application/json
Accept: text/event-stream
X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: <session-uuid>

{ "prompt": "Your message here" }
```

Your agent can respond with SSE streams or plain JSON.

## File Watching

Dev mode monitors your source files and automatically rebuilds/restarts on changes.

### Watch Behavior

- **Docker mode**: Watches the entire Dockerfile directory
- **Code mode**: Watches only `.py` files in the project
- **Debouncing**: 300ms stability threshold prevents rebuilds during file writes
- **Rebuild process**: Stops agent, refreshes credentials if expiring, restarts agent, resets session

### Excluded Paths

The following are always excluded from file watching:

- `node_modules/`, `.git/`, `.serverless/`
- `venv/`, `.venv/`
- `__pycache__/`, `*.pyc`
- `.pytest_cache/`, `.mypy_cache/`, `coverage/`
- Test files: `*_test.py`, `*.test.py`, `*.test.js`, `*.spec.js`

## Code Mode Requirements

### Python Version

Dev mode converts the runtime configuration to a Python command:

| Runtime Config | Python Command |
| -------------- | -------------- |
| `python3.13`   | `python3.13`   |
| `python3.12`   | `python3.12`   |

If the installed Python version doesn't match the configured runtime, dev mode logs a warning.

On Windows, `python.exe` is used regardless of the runtime configuration.

### Virtual Environment

A virtual environment is strongly recommended for code mode:

```bash
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# or: venv\Scripts\activate  # Windows

pip install -r requirements.txt
```

Dev mode detects the virtual environment via the `VIRTUAL_ENV` environment variable and:

- Prepends the venv `bin/` directory to `PATH`
- Passes `VIRTUAL_ENV` and `VIRTUAL_ENV_PROMPT` to the Python process
- Provides credential isolation from system-level AWS config

### File Structure

```text
my-agent/
├── agent.py              # Entry point (handler)
├── requirements.txt      # Dependencies
├── serverless.yml        # Configuration
└── venv/                 # Virtual environment (recommended)
```

## Troubleshooting

### "Failed to gather deployed agent resources"

You must deploy the agent before using dev mode. The IAM role and cloud resources must exist:

```bash
serverless deploy
```

### "Connection refused" when chatting

The agent is still starting up. Wait a few seconds for the container/process to initialize and begin listening on the
port.

### Python version mismatch warning

Dev mode detected a different Python version than configured. Install the correct version or update the `runtime` in
`serverless.yml`:

```bash
# Check installed version
python3.13 --version

# Or update serverless.yml
ai:
  agents:
    myAgent:
      runtime: python3.12  # Match your installed version
```

### Credentials fail after trust policy update

IAM trust policy changes take a few seconds to propagate. Dev mode waits 10 seconds automatically, but in rare cases you
may need to retry. Dev mode retries up to 10 times with exponential backoff.

### boto3 using wrong credentials (Code Mode)

If your agent uses system-level AWS credentials instead of the injected ones, activate a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
serverless dev
```

This isolates boto3 from `~/.aws/config` and SSO session caches.

### Agent crashes on file change

Dev mode does not auto-restart after crashes. Fix the issue in your code, and dev mode will rebuild automatically when
you save the file.

## Next Steps

- [Runtime Configuration](./runtime.md) - Deployment and runtime settings
- [Gateway Configuration](./gateway.md) - Custom tools via Lambda, OpenAPI, MCP
- [Memory Configuration](./memory.md) - Conversation persistence
- [Browser Configuration](./browser.md) - Web automation capabilities
- [Code Interpreter](./code-interpreter.md) - Sandboxed code execution
