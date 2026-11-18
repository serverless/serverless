<!--
title: AgentCore Code Interpreter
description: Let AI agents run Python, JavaScript and TypeScript in isolated sandboxes with Amazon Bedrock AgentCore Code Interpreter, or define custom ones.
short_title: Code Interpreter
keywords:
  [
    'Serverless Framework',
    'Amazon Bedrock AgentCore Code Interpreter',
    'AI agent code execution',
    'sandboxed Python execution',
    'data analysis agent',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/code-interpreter)

<!-- DOCS-SITE-LINK:END -->

# AgentCore Code Interpreter for agents

Amazon Bedrock AgentCore Code Interpreter runs code that an agent writes (Python, JavaScript or TypeScript) in an isolated sandbox session, with shell commands and files, so the agent can calculate, analyze data and produce charts. Every agent can use the AWS-managed code interpreter without configuration; define a custom one under `ai.codeInterpreters` when the code needs internet access or resources in a VPC.

This Python agent uses the AWS-managed code interpreter through the Strands Agents tool. No code interpreter configuration is needed in `serverless.yml`:

```yaml
# serverless.yml
ai:
  agents:
    analyst: {}
```

```python
# agent.py
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands_tools.code_interpreter import AgentCoreCodeInterpreter

app = BedrockAgentCoreApp()
code_interpreter = AgentCoreCodeInterpreter(region=os.environ["AWS_REGION"])


@app.entrypoint
async def invoke(payload, context):
    agent = Agent(
        tools=[code_interpreter.code_interpreter],
        system_prompt="You are a data analyst. Run code to calculate and analyze data.",
    )
    async for event in agent.stream_async(payload.get("prompt", "")):
        yield event


if __name__ == "__main__":
    app.run()
```

The agent needs the `bedrock-agentcore`, `strands-agents` and `strands-agents-tools` packages; with a `Dockerfile` in the service directory, the Framework builds and deploys it as described in [AgentCore Runtime agents](./runtime.md#deploy-an-agent-from-a-dockerfile). The agent's generated role allows sessions on the AWS-managed code interpreter, `aws.codeinterpreter.v1`.

Within a session, variables, imports and files persist between calls. A session stops after 15 minutes by default, or when the agent stops it.

## Use the code interpreter from a LangGraph agent

In Python, `create_code_interpreter_toolkit` from `langchain_aws.tools` returns ready-made tools; call `cleanup()` to stop the session:

```python
import os

from langchain.chat_models import init_chat_model
from langchain_aws.tools import create_code_interpreter_toolkit
from langgraph.prebuilt import create_react_agent


async def run(prompt):
    toolkit, tools = await create_code_interpreter_toolkit(region=os.environ["AWS_REGION"])
    try:
        llm = init_chat_model(os.environ["MODEL_ID"], model_provider="bedrock_converse")
        agent = create_react_agent(model=llm, tools=tools)
        result = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})
        return result["messages"][-1].content
    finally:
        await toolkit.cleanup()
```

## Use the code interpreter from a JavaScript agent

The `bedrock-agentcore` package provides `CodeInterpreter`, with `executeCode`, `executeCommand`, `readFiles`, `writeFiles`, `listFiles` and `stopSession`. Wrap the methods as tools for your agent framework:

```javascript
// index.js
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { CodeInterpreter } from 'bedrock-agentcore/code-interpreter'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { createAgent } from 'langchain'
import { z } from 'zod'

const codeInterpreter = new CodeInterpreter({ region: process.env.AWS_REGION })

const executeCode = tool(
  async ({ code, language }) =>
    (await codeInterpreter.executeCode({ code, language })) || 'No output',
  {
    name: 'execute_code',
    description: 'Run code in a sandbox and return its output.',
    schema: z.object({
      code: z.string(),
      language: z
        .enum(['python', 'javascript', 'typescript'])
        .default('python'),
    }),
  },
)

const agent = createAgent({
  model: new ChatBedrockConverse({
    model: process.env.MODEL_ID,
    region: process.env.AWS_REGION,
  }),
  tools: [executeCode],
})

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({ prompt: z.string() }),
    async process(request) {
      try {
        const result = await agent.invoke({
          messages: [{ role: 'user', content: request.prompt }],
        })
        return { result: result.messages.at(-1).content }
      } finally {
        await codeInterpreter.stopSession()
      }
    },
  },
})

app.run()
```

Set `MODEL_ID` in the agent's `environment`. The dependencies:

```json
{
  "type": "module",
  "dependencies": {
    "@langchain/aws": "^1.2.5",
    "@langchain/core": "^1.1.28",
    "bedrock-agentcore": "^0.4.0",
    "langchain": "^1.2.27",
    "zod": "^4.3.6"
  }
}
```

## Define a custom code interpreter

A custom code interpreter is an `AWS::BedrockAgentCore::CodeInterpreterCustom` resource with your network mode and execution role. `network.mode` selects what the sandboxed code can reach:

| Mode                | The code can reach                                          |
| ------------------- | ----------------------------------------------------------- |
| `SANDBOX` (default) | No public internet                                          |
| `PUBLIC`            | The internet, for example to call APIs or download packages |
| `VPC`               | Resources in your VPC, through your subnets                 |

```yaml
ai:
  codeInterpreters:
    webAnalyst:
      description: Code interpreter with internet access
      network:
        mode: PUBLIC
```

`description`, `network` and `role` are fixed when AWS creates the code interpreter: changing one of them replaces it, and it gets a new ID.

### Use a custom code interpreter from an agent

The Framework doesn't connect custom code interpreters to agents. Pass the code interpreter ID to the agent in an environment variable, and allow the session actions on its ARN:

```yaml
ai:
  codeInterpreters:
    webAnalyst:
      network:
        mode: PUBLIC

  agents:
    analyst:
      environment:
        CODE_INTERPRETER_ID: !GetAtt WebAnalystCodeInterpreter.CodeInterpreterId
      role:
        statements:
          - Effect: Allow
            Action:
              - bedrock-agentcore:StartCodeInterpreterSession
              - bedrock-agentcore:InvokeCodeInterpreter
              - bedrock-agentcore:StopCodeInterpreterSession
            Resource: !GetAtt WebAnalystCodeInterpreter.CodeInterpreterArn
```

The logical ID is the code interpreter's name with the first letter capitalized, followed by `CodeInterpreter` (`webAnalyst` becomes `WebAnalystCodeInterpreter`). In the agent code, pass the ID when you start a session.

In JavaScript:

```javascript
import { CodeInterpreter } from 'bedrock-agentcore/code-interpreter'

const codeInterpreter = new CodeInterpreter({
  region: process.env.AWS_REGION,
  identifier: process.env.CODE_INTERPRETER_ID,
})
```

In Python:

```python
import os

from bedrock_agentcore.tools.code_interpreter_client import CodeInterpreter

code_interpreter = CodeInterpreter(region=os.environ["AWS_REGION"])
code_interpreter.start(identifier=os.environ["CODE_INTERPRETER_ID"])
response = code_interpreter.invoke(
    method="executeCode",
    params={"code": "print(6 * 7)", "language": "python"},
)
code_interpreter.stop()
```

## Connect a code interpreter to a VPC

With `network.mode: VPC`, the code interpreter runs with network interfaces in your subnets:

```yaml
ai:
  codeInterpreters:
    warehouse:
      network:
        mode: VPC
        subnets:
          - subnet-0123456789abcdef0
          - subnet-0123456789abcdef1
        securityGroups:
          - sg-0123456789abcdef0
```

`subnets` and `securityGroups` are both required, 1 to 16 IDs each, and the subnets must be in Availability Zones that AgentCore supports. For internet access as well, use private subnets with a route to a NAT gateway. See [Configure AgentCore for VPC](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-vpc.html).

## IAM role for a code interpreter

The code interpreter's execution role is what code in the sandbox runs with, for example AWS CLI commands that read from Amazon S3. Without `role`, the Framework creates one per code interpreter, named `<service>_<name>_ci_role_<stage>` (truncated to 48 characters), that allows CloudWatch Logs under `/aws/bedrock-agentcore/`. To give the code more access, add statements:

```yaml
ai:
  codeInterpreters:
    warehouse:
      role:
        statements:
          - Effect: Allow
            Action: s3:GetObject
            Resource: arn:aws:s3:::my-data-bucket/*
```

`role` takes the same forms as an agent's role: an object with `name`, `statements`, `managedPolicies`, `permissionsBoundary` and `tags`, or an ARN, a logical ID or a CloudFormation intrinsic to use a role you manage. See [IAM role for an agent](./runtime.md#iam-role-for-an-agent).

## `ai.codeInterpreters` configuration reference

| Key                      | Type             | Default        | Value                                                                   |
| ------------------------ | ---------------- | -------------- | ----------------------------------------------------------------------- |
| `network.mode`           | string           | `SANDBOX`      | `SANDBOX`, `PUBLIC` or `VPC`                                            |
| `network.subnets`        | list of strings  | None           | Subnet IDs; required with `VPC`                                         |
| `network.securityGroups` | list of strings  | None           | Security group IDs; required with `VPC`                                 |
| `description`            | string           | None           | 1 to 1,200 characters                                                   |
| `role`                   | string or object | Generated role | See [IAM role for a code interpreter](#iam-role-for-a-code-interpreter) |
| `tags`                   | map of strings   | None           | Tags on the code interpreter                                            |

For a code interpreter named `webAnalyst`, the stack contains `WebAnalystCodeInterpreter`, named `<service>_webAnalyst_<stage>` (truncated to 48 characters), and outputs `WebAnalystCodeInterpreterArn` (exported as `<service>-<stage>-webAnalyst-CodeInterpreterArn`), `WebAnalystCodeInterpreterId` and `WebAnalystCodeInterpreterRoleArn`.

## Examples

- [LangGraph with the AWS-managed code interpreter (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-code-interpreter) and [(Python)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/langgraph-code-interpreter).
- [Custom code interpreter with `PUBLIC` network mode (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-code-interpreter-custom) and [(Python)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/langgraph-code-interpreter-custom).

## Related pages

- [AgentCore Browser](./browser.md): let the agent browse websites.
- [AgentCore Runtime agents](./runtime.md): the agent settings, including `role` and `environment`.
- [Amazon Bedrock AgentCore Code Interpreter](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-interpreter-tool.html) in the AgentCore developer guide.
