<!--
title: Dev Mode for AgentCore Agents
description: Run an Amazon Bedrock AgentCore agent on your machine with serverless dev, using its deployed role, tools and memory, with hot reload and a chat.
short_title: Agent Dev Mode
keywords:
  [
    'Serverless Framework',
    'serverless dev agents',
    'Amazon Bedrock AgentCore local development',
    'AI agent hot reload',
    'AgentCore Dev Mode',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/dev)

<!-- DOCS-SITE-LINK:END -->

# Dev Mode for AgentCore agents

Dev Mode for agents (`serverless dev` in a service with `ai.agents`) runs one Amazon Bedrock AgentCore agent on your machine, in Docker or as a Python process, with the permissions of its deployed execution role and the URLs and IDs of its deployed gateway and memory. It rebuilds the agent when you save a file and opens a chat in the terminal, so you can change agent code without redeploying. For Lambda functions, see [Dev Mode](../dev-mode.md).

Deploy the service once, so the role and resources exist, then start Dev Mode:

```bash
serverless deploy
```

```bash
serverless dev
```

When the agent is ready, the terminal shows the local URL and a prompt. Type a message and press Enter:

```text
Dev mode running on http://localhost:8080

Session ID: 3f1c9a52-7d4e-4b8a-9c61-0e2f5b7a8d14
Type your message and press Enter to chat with the agent.
Press Ctrl+C to stop.

You: What can you help me with?

Agent:
I can answer questions about your orders and run calculations.
```

Press `Ctrl+C` to stop the agent and remove its container.

## Choose the agent and the mode

`serverless dev` selects agents Dev Mode when the service defines agents and no functions. When it defines both, pass `--mode agents`:

```bash
serverless dev --mode agents --agent assistant
```

| Option                | Short | Value                                                                                    |
| --------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `--mode`              | `-m`  | `agents` selects agents Dev Mode; `functions` and `sandboxes` select the other Dev Modes |
| `--agent`             | `-a`  | The agent to run. Required when the service defines more than one agent                  |
| `--port`              | `-p`  | The local port of the agent. Default: `8080`                                             |
| `--stage`, `--region` |       | The deployed stage and region whose resources the agent uses                             |

With `--sandbox`, or when the service defines only sandboxes, `serverless dev` runs sandboxes Dev Mode instead. Dev Mode runs one agent at a time.

## How Dev Mode for agents works

When you run `serverless dev`, the Framework:

1. Reads the deployed stack's outputs: the agent's role ARN, its gateway URL and its memory ID.
2. Adds your AWS identity to the role's trust policy, if it isn't there yet, and waits 10 seconds for IAM to apply the change.
3. Assumes the role with AWS STS and gets temporary credentials, valid for one hour. It retries up to 10 times with exponential backoff while IAM propagates.
4. Starts the agent in Docker or as a Python process, with the credentials and environment variables.
5. Watches the agent's files and rebuilds or restarts the agent when one changes.
6. Opens the chat, which sends each message to `http://localhost:<port>/invocations`.

The agent calls AWS directly with the temporary credentials, so it reaches the same Bedrock models, gateway tools and memory as the deployed agent. Requests don't pass through AgentCore Runtime.

## Docker and code execution modes

Dev Mode picks how to run the agent from its configuration:

| Priority | Condition                                      | Mode                          |
| -------- | ---------------------------------------------- | ----------------------------- |
| 1        | `artifact.image` is a build object             | Docker                        |
| 2        | `handler` is set                               | Code                          |
| 3        | A `Dockerfile` exists in the service directory | Docker                        |
| 4        | None of the above                              | Docker, built with Buildpacks |

When `artifact.image` is a pre-built image URI, Dev Mode builds the image locally from the service directory (priority 3 or 4) instead of pulling the URI.

### Docker mode

Docker mode builds the image as the deployment does, for `linux/arm64`, and tags it `<service>-<agent>:local`. It runs the container as `sls-dev-<service>-<agent>`, maps container port 8080 to `--port` on `127.0.0.1` only, and on a file change rebuilds the image and starts a new container. It watches `artifact.image.path`, or the service directory. This mode is the closest to the deployed agent.

### Code mode

Code mode runs the `handler` file with the Python command that matches `runtime` (`python3.13` for `runtime: python3.13`; `python.exe` on Windows), from the service directory, and restarts it when a `.py` file changes:

```yaml
ai:
  agents:
    assistant:
      handler: agent.py
      runtime: python3.14
```

The agent must listen on the port in the `PORT` environment variable, which is `8080` unless you pass `--port`:

```python
import os

if __name__ == "__main__":
    app.run(port=int(os.getenv("PORT", 8080)))
```

`runtime` accepts `python3.10` to `python3.14`; the default is `python3.13`. Dev Mode logs a warning when the installed version differs from `runtime`, and stops with an error for any other value. To use a specific Python installation, activate a virtual environment before starting Dev Mode; Dev Mode puts its `bin` directory first in `PATH`:

```bash
python3.14 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
serverless dev
```

The Python process receives only `PATH`, `USER`, `LANG`, `VIRTUAL_ENV`, `VIRTUAL_ENV_PROMPT` and the variables in [Agent environment variables in Dev Mode](#agent-environment-variables-in-dev-mode), not the rest of your shell environment.

## Agent environment variables in Dev Mode

Dev Mode sets these variables in the container or Python process:

| Variable                                                          | Value                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | Temporary credentials of the agent's role                 |
| `AWS_REGION`, `AWS_DEFAULT_REGION`                                | The service's region                                      |
| `AGENTCORE_DEV_MODE`                                              | `true`, to detect Dev Mode in agent code                  |
| `PYTHONUNBUFFERED`                                                | `1`, so Python logs appear at once                        |
| `SLS_SERVICE`, `SLS_STAGE`, `SLS_AGENT`                           | The service, stage and agent names                        |
| `BEDROCK_AGENTCORE_GATEWAY_URL`                                   | The URL of the agent's gateway, when one is deployed      |
| `BEDROCK_AGENTCORE_MEMORY_ID`                                     | The ID of the agent's memory, when the agent has `memory` |
| `PORT`                                                            | The port to listen on, in code mode only                  |

The variables from `provider.environment` and the agent's `environment` are added too; the agent's keys win. CloudFormation references in them (`!Ref`, `!GetAtt`, `!ImportValue`) are resolved from the deployed stack. AWS SDKs read the credential variables before any profile, so the agent uses the role's permissions, not yours.

## Credentials and the role's trust policy

Dev Mode assumes the agent's execution role: the role the Framework generated, or the role whose ARN is set in the agent's `role`. To do that, it adds a statement with the ID `ServerlessAgentCoreLocalDevPolicy` to the role's trust policy, naming your AWS identity; SSO and other assumed-role sessions are added as their role. The statement stays on the role until a deployment updates the role.

Your AWS identity needs `cloudformation:DescribeStacks` on the stack, and `iam:GetRole`, `iam:UpdateAssumeRolePolicy` and `sts:AssumeRole` on the role.

The credentials last one hour. When you save a file and fewer than 10 minutes remain, Dev Mode gets new credentials before it restarts the agent. After an hour without a file change, the agent's AWS calls are denied until you save a file or restart Dev Mode.

## Chat with the agent

The chat sends each message as a `POST` to the local agent:

```text
POST http://localhost:<port>/invocations
Content-Type: application/json
X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: <session-uuid>

{ "prompt": "Your message here" }
```

- The agent can answer with server-sent events, which the chat prints as they arrive, or with JSON; the chat prints the `result`, `response` or `message` field, or the whole object.
- The session ID is a new UUID when Dev Mode starts and after each rebuild.
- The chat works with agents that use the `HTTP` protocol (the default). An agent with `protocol: MCP` or `A2A` serves another port and path.
- Send one message at a time: a message typed while the agent is answering gets "Please wait for the current request to complete."

To call the local agent from another tool, send the same request with `curl`.

## Files Dev Mode watches

Dev Mode rebuilds or restarts the agent when a watched file is added, changed or removed, after the file has been stable for 300 ms. It ignores:

- `node_modules/`, `.git/`, `.serverless/`, `venv/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/` and `coverage/`.
- Test files: `*.test.js`, `*.spec.js`, `*_test.py` and `*.test.py`.
- In code mode, every file that doesn't end in `.py`.

## Troubleshoot Dev Mode for agents

### `Failed to gather deployed agent resources. Make sure the agent is deployed first.`

Dev Mode reads the agent's role ARN from the deployed stack. Deploy the service, with the same `--stage` and `--region` you pass to `serverless dev`:

```bash
serverless deploy
```

### `Multiple agents found. Use -a to specify which agent to run in dev mode`

The service defines more than one agent. Pass the agent's name with `--agent` (`-a`).

### `Error: Container is not responding. It may be restarting.`

The agent is still starting or rebuilding. Wait a few seconds and send the message again. If it persists, check the agent's logs in the terminal: the agent must listen on `0.0.0.0` at port 8080 in Docker mode, or on `PORT` in code mode.

### `Unsupported agent runtime "...". The "runtime" option only selects the Python version`

`runtime` must be one of `python3.10` to `python3.14`. To use a specific Python installation, activate a virtual environment or adjust `PATH`.

### `Python process exited with code ...`

The agent's code stopped with an error, shown in the lines before. Fix the code and save the file: Dev Mode restarts the process when a `.py` file changes.

### AWS calls from the agent are denied

The agent runs with its execution role, not your credentials. Add the missing permission to the agent's `role.statements` and deploy; see [IAM role for an agent](./runtime.md#iam-role-for-an-agent).

## Related pages

- [AgentCore Runtime agents](./runtime.md): deploy the agent.
- [AgentCore Gateway tools](./gateway.md) and [AgentCore Memory](./memory.md): the resources the agent uses in Dev Mode.
- [`serverless dev` command](../../cli-reference/dev.md): all options of the command.
