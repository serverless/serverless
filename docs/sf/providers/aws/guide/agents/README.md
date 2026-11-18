<!--
title: AI Agents on Amazon Bedrock AgentCore
description: Deploy AI agents to Amazon Bedrock AgentCore with the ai block in serverless.yml, with tools, memory, browser and code interpreter.
short_title: AI Agents
keywords:
  [
    'Serverless Framework',
    'Amazon Bedrock AgentCore',
    'AI agents',
    'AgentCore Runtime',
    'LangGraph',
    'Strands Agents',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents)

<!-- DOCS-SITE-LINK:END -->

# AI agents on Amazon Bedrock AgentCore

The Serverless Framework deploys AI agents to Amazon Bedrock AgentCore from the top-level `ai` block in `serverless.yml`, alongside your Lambda functions. Use it to host an agent built with any framework (LangGraph, Strands Agents, CrewAI or your own code) and to give it tools, memory, a cloud browser and a code sandbox.

## Deploy a minimal agent

This service deploys one Python agent with direct code deployment, so Docker isn't needed. The agent answers every request with the prompt it received; replace the function body with your agent framework's call.

```yaml
# serverless.yml
service: my-agent

provider:
  name: aws
  region: us-east-1

ai:
  agents:
    assistant:
      handler: agent.py
      runtime: python3.14
```

The handler file uses the [Amazon Bedrock AgentCore Python SDK](https://github.com/aws/bedrock-agentcore-sdk-python):

```python
# agent.py
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()


@app.entrypoint
def invoke(payload, context):
    return {"result": f"You said: {payload.get('prompt', '')}"}


if __name__ == "__main__":
    app.run()
```

List the dependencies in `requirements.txt`; the Framework installs them as Linux ARM64 wheels into the deployment package:

```text
bedrock-agentcore
```

Deploy the service, then send the agent a prompt:

```bash
serverless deploy
```

```bash
serverless invoke --agent assistant --data '{"prompt": "Hello"}'
```

```text
{"result": "You said: Hello"}
```

To remove the agent and every resource the service created, run `serverless remove`.

## Agent pages

- [AgentCore Runtime agents](./runtime.md): deploy an agent from a Dockerfile, from source, from a pre-built image or as Python code, and configure its network, authorization, endpoints and IAM role.
- [AgentCore Gateway tools](./gateway.md): expose Lambda functions, OpenAPI and Smithy APIs and MCP servers to agents as MCP tools.
- [AgentCore Memory](./memory.md): store conversation events and extract long-term memories with memory strategies.
- [AgentCore Browser](./browser.md): let an agent browse websites with the AWS-managed browser or a custom browser with session recording.
- [AgentCore Code Interpreter](./code-interpreter.md): let an agent run Python, JavaScript and TypeScript in an isolated sandbox.
- [Dev Mode for AgentCore agents](./dev.md): run an agent on your machine against its deployed resources, with hot reload and an interactive chat.

## The `ai` block

Each key under `ai` defines one kind of AgentCore resource; the key names under it are your names for the resources.

| Key                   | What it defines                                          | Page                                                |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `ai.agents`           | AgentCore Runtime agents                                 | [AgentCore Runtime agents](./runtime.md)            |
| `ai.tools`            | Tools: Lambda functions, OpenAPI, Smithy and MCP targets | [AgentCore Gateway tools](./gateway.md)             |
| `ai.gateways`         | Gateways that group tools and set their authorization    | [AgentCore Gateway tools](./gateway.md)             |
| `ai.memory`           | Memory resources that agents share by name               | [AgentCore Memory](./memory.md)                     |
| `ai.browsers`         | Custom browsers                                          | [AgentCore Browser](./browser.md)                   |
| `ai.codeInterpreters` | Custom code interpreters                                 | [AgentCore Code Interpreter](./code-interpreter.md) |

The [`serverless.yml` reference](../serverless.yml.md#ai-agents) lists every key of the `ai` block in one place.

## Examples

The [Amazon Bedrock AgentCore examples](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore) cover JavaScript and Python agents built with LangGraph and Strands Agents: container and code deployment, streaming, memory, gateway tools, browser, code interpreter and an MCP server runtime.
