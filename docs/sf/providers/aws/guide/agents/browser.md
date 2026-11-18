<!--
title: AgentCore Browser
description: Let AI agents browse websites with Amazon Bedrock AgentCore Browser, or define custom browsers with session recording, Web Bot Auth or VPC access.
short_title: Browser
keywords:
  [
    'Serverless Framework',
    'Amazon Bedrock AgentCore Browser',
    'AI agent web browsing',
    'browser session recording',
    'Playwright agent',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/browser)

<!-- DOCS-SITE-LINK:END -->

# AgentCore Browser for agents

Amazon Bedrock AgentCore Browser runs a cloud browser in an isolated session that an agent drives to open pages, click, fill forms and read content. Every agent can use the AWS-managed browser without configuration; define a custom browser under `ai.browsers` when you need session recording, Web Bot Auth signatures or access to resources in a VPC.

This Python agent uses the AWS-managed browser through the Strands Agents browser tool. No browser configuration is needed in `serverless.yml`:

```yaml
# serverless.yml
ai:
  agents:
    webAgent: {}
```

```python
# agent.py
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands_tools.browser import AgentCoreBrowser

app = BedrockAgentCoreApp()
browser_tool = AgentCoreBrowser(region=os.environ["AWS_REGION"])


@app.entrypoint
async def invoke(payload, context):
    agent = Agent(
        tools=[browser_tool.browser],
        system_prompt="You can browse the web. Use the browser to answer questions about websites.",
    )
    async for event in agent.stream_async(payload.get("prompt", "")):
        yield event


if __name__ == "__main__":
    app.run()
```

The agent needs the `bedrock-agentcore`, `strands-agents`, `strands-agents-tools` and `playwright` packages; with a `Dockerfile` in the service directory, the Framework builds and deploys it as described in [AgentCore Runtime agents](./runtime.md#deploy-an-agent-from-a-dockerfile). The agent's generated role allows sessions on the AWS-managed browser, `aws.browser.v1`.

## Use the browser from a JavaScript agent

The `bedrock-agentcore` package provides `PlaywrightBrowser`, which starts a browser session and drives it with Playwright. Wrap its methods as tools for your agent framework:

```javascript
// index.js
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { PlaywrightBrowser } from 'bedrock-agentcore/browser/playwright'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { createAgent } from 'langchain'
import { z } from 'zod'

const browser = new PlaywrightBrowser({ region: process.env.AWS_REGION })

const navigate = tool(
  async ({ url }) => {
    await browser.navigate({ url, waitUntil: 'domcontentloaded' })
    return `Opened ${url}`
  },
  {
    name: 'navigate',
    description: 'Open a URL in the browser.',
    schema: z.object({ url: z.string() }),
  },
)

const getText = tool(
  async ({ selector }) =>
    (await browser.getText({ selector })) || 'No text found',
  {
    name: 'get_text',
    description: 'Read the text of the elements that match a CSS selector.',
    schema: z.object({ selector: z.string() }),
  },
)

const agent = createAgent({
  model: new ChatBedrockConverse({
    model: process.env.MODEL_ID,
    region: process.env.AWS_REGION,
  }),
  tools: [navigate, getText],
})

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({ prompt: z.string() }),
    async process(request) {
      await browser.startSession()
      try {
        const result = await agent.invoke({
          messages: [{ role: 'user', content: request.prompt }],
        })
        return { response: result.messages.at(-1).content }
      } finally {
        await browser.stopSession()
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
    "playwright": "^1.58.2",
    "zod": "^4.3.6"
  }
}
```

LangChain users in Python can use `create_browser_toolkit` from `langchain_aws.tools` instead.

## Define a custom browser

A custom browser is an `AWS::BedrockAgentCore::BrowserCustom` resource with your settings. Use one when you need any of these:

| Need                                                             | Setting             |
| ---------------------------------------------------------------- | ------------------- |
| Recordings of sessions in Amazon S3                              | `recording`         |
| Websites can verify requests come from your agent (Web Bot Auth) | `signing`           |
| Access to private resources in a VPC                             | `network.mode: VPC` |
| A browser role with permissions of your choice                   | `role`              |

```yaml
ai:
  browsers:
    research:
      description: Browser for the research agent
      network:
        mode: PUBLIC
      signing:
        enabled: true
```

Browser settings other than `tags` are fixed when AWS creates the browser: changing one of them replaces the browser, which then gets a new ID.

### Use a custom browser from an agent

The Framework doesn't connect custom browsers to agents. Pass the browser ID to the agent in an environment variable, and allow the session actions on the browser's ARN:

```yaml
ai:
  browsers:
    research:
      network:
        mode: PUBLIC

  agents:
    researcher:
      environment:
        BROWSER_ID: !GetAtt ResearchBrowser.BrowserId
      role:
        statements:
          - Effect: Allow
            Action:
              - bedrock-agentcore:StartBrowserSession
              - bedrock-agentcore:StopBrowserSession
              - bedrock-agentcore:UpdateBrowserStream
              - bedrock-agentcore:ConnectBrowserAutomationStream
            Resource: !GetAtt ResearchBrowser.BrowserArn
```

The browser's logical ID is its name with the first letter capitalized, followed by `Browser` (`research` becomes `ResearchBrowser`). In the agent code, start sessions with that ID: `BrowserClient(region=...).start(identifier=os.environ["BROWSER_ID"])` from `bedrock_agentcore.tools.browser_client` in Python, or `new Browser({ region, identifier: process.env.BROWSER_ID })` from `bedrock-agentcore/browser` in JavaScript.

## Record browser sessions to Amazon S3

`recording` saves a replay of each session to an S3 bucket you own. This service creates the bucket in `resources` and records into it:

```yaml
resources:
  Resources:
    RecordingsBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:service}-recordings-${aws:accountId}-${sls:stage}

ai:
  browsers:
    audited:
      recording:
        enabled: true
        s3Location:
          bucket: ${self:service}-recordings-${aws:accountId}-${sls:stage}
          prefix: browser-sessions/
```

`s3Location.bucket` takes the bucket name as a string, and `s3Location.prefix` is required with it. The browser's generated role gets `s3:PutObject`, `s3:ListMultipartUploadParts` and `s3:AbortMultipartUpload` on objects under the prefix, in buckets of your account.

## Connect a browser to a VPC

With `network.mode: VPC`, the browser runs with network interfaces in your subnets:

```yaml
ai:
  browsers:
    intranet:
      network:
        mode: VPC
        subnets:
          - subnet-0123456789abcdef0
          - subnet-0123456789abcdef1
        securityGroups:
          - sg-0123456789abcdef0
```

`subnets` and `securityGroups` are both required, 1 to 16 IDs each, and the subnets must be in Availability Zones that AgentCore supports. To reach public websites from a VPC browser, use private subnets with a route to a NAT gateway. See [Configure AgentCore for VPC](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-vpc.html). Browsers accept `PUBLIC` (default) and `VPC`.

## IAM role for a browser

Without `role`, the Framework creates a role per browser, named `<service>_<browser>_browser_role_<stage>` (truncated to 48 characters). It allows CloudWatch Logs under `/aws/bedrock-agentcore/`, and the S3 recording actions when `recording.s3Location` is set. To add statements, managed policies, a permissions boundary, tags or a custom name, set `role` to an object; to use your own role, set it to an ARN, a logical ID or a CloudFormation intrinsic. See [IAM role for an agent](./runtime.md#iam-role-for-an-agent):

```yaml
ai:
  browsers:
    research:
      role:
        statements:
          - Effect: Allow
            Action: s3:GetObject
            Resource: arn:aws:s3:::my-browser-assets/*
```

## `ai.browsers` configuration reference

| Key                      | Type             | Default        | Value                                                 |
| ------------------------ | ---------------- | -------------- | ----------------------------------------------------- |
| `network.mode`           | string           | `PUBLIC`       | `PUBLIC` or `VPC`                                     |
| `network.subnets`        | list of strings  | None           | Subnet IDs; required with `VPC`                       |
| `network.securityGroups` | list of strings  | None           | Security group IDs; required with `VPC`               |
| `recording.enabled`      | boolean          | None           | Turns session recording on                            |
| `recording.s3Location`   | object           | None           | `bucket` and `prefix`, both required                  |
| `signing.enabled`        | boolean          | `false`        | Signs the browser's requests with Web Bot Auth        |
| `description`            | string           | None           | 1 to 1,200 characters                                 |
| `role`                   | string or object | Generated role | See [IAM role for a browser](#iam-role-for-a-browser) |
| `tags`                   | map of strings   | None           | Tags on the browser                                   |

For a browser named `research`, the stack contains `ResearchBrowser`, named `<service>_research_<stage>` (truncated to 48 characters), and outputs `ResearchBrowserArn` (exported as `<service>-<stage>-research-BrowserArn`), `ResearchBrowserId` and `ResearchBrowserRoleArn`.

## Examples

- [LangGraph with the AWS-managed browser (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-browser) and [(Python)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/langgraph-browser).
- [Custom browser with session recording (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-browser-custom) and [(Python)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/langgraph-browser-custom).
- [Strands Agents with the browser (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/strands-browser) and [(Python)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/strands-browser).

## Related pages

- [AgentCore Code Interpreter](./code-interpreter.md): run code in a sandbox.
- [AgentCore Runtime agents](./runtime.md): the agent settings, including `role` and `environment`.
- [Amazon Bedrock AgentCore Browser](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-tool.html) in the AgentCore developer guide.
