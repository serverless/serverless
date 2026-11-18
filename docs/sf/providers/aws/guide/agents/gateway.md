<!--
title: AgentCore Gateway Tools
description: 'Give AI agents tools with Amazon Bedrock AgentCore Gateway: Lambda functions, OpenAPI and Smithy APIs, and MCP servers, served over MCP.'
short_title: Gateway
keywords:
  [
    'Serverless Framework',
    'Amazon Bedrock AgentCore Gateway',
    'AI agent tools',
    'Lambda function as MCP tool',
    'OpenAPI MCP tools',
    'MCP gateway',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/gateway)

<!-- DOCS-SITE-LINK:END -->

# AgentCore Gateway tools for agents

Amazon Bedrock AgentCore Gateway turns Lambda functions, OpenAPI and Smithy APIs, and remote MCP servers into tools that an agent discovers and calls over the Model Context Protocol (MCP). In `serverless.yml`, `ai.tools` defines the tools and `ai.gateways` optionally groups them; the Framework creates the gateway, one gateway target per tool and the IAM roles, and gives each agent its gateway URL.

This service turns a Lambda function into an `add` tool for the Python agent `assistant`:

```yaml
# serverless.yml
service: my-agent

provider:
  name: aws
  region: us-east-1

functions:
  calculator:
    handler: calculator.handler
    runtime: nodejs24.x

ai:
  tools:
    calculator:
      function: calculator
      toolSchema:
        - name: add
          description: Add two numbers
          inputSchema:
            type: object
            properties:
              a:
                type: number
              b:
                type: number
            required:
              - a
              - b

  agents:
    assistant:
      handler: agent.py
      runtime: python3.14
```

The function receives the tool's arguments as its event:

```javascript
// calculator.mjs
export const handler = async (event) => {
  return { sum: event.a + event.b }
}
```

Without `ai.gateways`, the Framework creates one gateway with every tool in `ai.tools`, using `AWS_IAM` (SigV4) authorization, attaches it to every agent and sets `BEDROCK_AGENTCORE_GATEWAY_URL` in each agent's environment. The agent's `agent.py` and `requirements.txt`, which connect to that URL and call the tool, are in [Call gateway tools from agent code](#call-gateway-tools-from-agent-code).

- A tool's key in `ai.tools` can be the same as a function's key in `functions`, as `calculator` is here: tools, functions and agents are named separately.
- `assistant` is deployed as Python code with `handler`; any agent from [AgentCore Runtime agents](./runtime.md#choose-a-deployment-method) can use the gateway. An agent written as `assistant: {}` is also complete: the Framework builds it from the `Dockerfile` in the service directory or, without one, from source with Cloud Native Buildpacks.

## Lambda function tools

A function tool calls a Lambda function. `function` names a function in the same service, and `toolSchema` describes the tools the function implements:

```yaml
ai:
  tools:
    orders:
      function: ordersHandler
      toolSchema:
        - name: get_order
          description: Get an order by its ID
          inputSchema:
            type: object
            properties:
              orderId:
                type: string
            required:
              - orderId
        - name: cancel_order
          description: Cancel an order by its ID
          inputSchema:
            type: object
            properties:
              orderId:
                type: string
            required:
              - orderId
```

`function` takes one of these forms:

| Form                                                                       | Calls                                     |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| `function: ordersHandler`                                                  | `functions.ordersHandler` in this service |
| `function: { name: ordersHandler }`                                        | `functions.ordersHandler` in this service |
| `function: { arn: arn:aws:lambda:us-east-1:123456789012:function:orders }` | Any function, by ARN                      |

`toolSchema` is required for function tools. It takes a list of tool definitions or the path of a JSON file, relative to the service, that contains one definition or a list (`toolSchema: ./tools/orders.json`). Each definition has:

| Key            | Required | Value                                                    |
| -------------- | -------- | -------------------------------------------------------- |
| `name`         | Yes      | The tool name the agent calls                            |
| `description`  | Yes      | What the tool does; the model uses it to choose the tool |
| `inputSchema`  | Yes      | A JSON Schema of `type: object` for the tool's arguments |
| `outputSchema` | No       | A JSON Schema of `type: object` for the tool's result    |

Properties in the schemas use `type`, `description`, `properties`, `required`, `items` and `enum`.

### Handle tool calls in the Lambda function

The gateway invokes the function with the tool's arguments as the event, for example `{ "orderId": "o-123" }`. The tool name is in the client context as `bedrockAgentCoreToolName`, prefixed with the target name and three underscores (`orders___get_order`). The target name is the tool's key in `ai.tools`, with characters other than letters, digits and `-` replaced by `-`. The function returns JSON:

```javascript
// orders.mjs
export const handler = async (event, context) => {
  const fullName = context.clientContext?.custom?.bedrockAgentCoreToolName ?? ''
  const toolName = fullName.slice(fullName.indexOf('___') + 3)

  if (toolName === 'get_order') {
    return { orderId: event.orderId, status: 'shipped' }
  }
  if (toolName === 'cancel_order') {
    return { orderId: event.orderId, status: 'cancelled' }
  }
  throw new Error(`Unknown tool: ${toolName}`)
}
```

For the full event and context format, see [AWS Lambda function targets](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-add-target-lambda.html).

## OpenAPI and Smithy API tools

An `openapi` tool exposes the operations of an HTTP API described by an OpenAPI specification, and a `smithy` tool those of a [Smithy](https://smithy.io/) model:

```yaml
ai:
  tools:
    weather:
      openapi: ./openapi/weather.yml
    inventory:
      smithy: ./models/inventory.json
```

`openapi` and `smithy` take a file path, relative to the service, or the specification itself as a string. A value is read as a path when it starts with `.` or `/`, or ends in `.yml`, `.yaml`, `.json` or `.smithy`. The Framework embeds the file contents in the template. To call an API that needs credentials, add [`credentials`](#authenticate-tools-to-external-apis).

An OpenAPI tool has no URL setting in `serverless.yml`: the gateway sends requests to the URL in the specification's `servers` entry, which must be the API's real endpoint. Each operation needs an `operationId`, which becomes the tool name. The supported OpenAPI versions and features are listed in [OpenAPI schema targets](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-schema-openapi.html):

```yaml
# openapi/weather.yml
openapi: 3.0.0
info:
  title: Weather API
  version: 1.0.0
servers:
  - url: https://api.example.com/v1
paths:
  /weather:
    get:
      operationId: getCurrentWeather
      description: Get the current weather for a city
      parameters:
        - name: city
          in: query
          required: true
          schema:
            type: string
      responses:
        '200':
          description: The current weather
```

## MCP server tools

An `mcp` tool connects the gateway to a remote MCP server and exposes its tools. The URL must start with `https://`:

```yaml
ai:
  tools:
    docsSearch:
      mcp: https://mcp.example.com/mcp
```

## Authenticate tools to external APIs

By default, the gateway calls a tool with its own IAM role (`GATEWAY_IAM_ROLE`), which suits Lambda tools. For an API or MCP server that needs OAuth or an API key, set `credentials` to a credential provider in AgentCore Identity.

The Framework doesn't create credential providers. Create the provider first, with the AgentCore console, the AWS CLI or an SDK, in the same account and Region as the service, as described in [Configure credential provider](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-providers.html). For an API key provider, for example:

```bash
aws bedrock-agentcore-control create-api-key-credential-provider \
  --name weather \
  --api-key YOUR_API_KEY \
  --region us-east-1
```

The response contains the provider's ARN. Set it as `provider`:

```yaml
ai:
  tools:
    spotify:
      openapi: ./openapi/spotify.yml
      credentials:
        type: OAUTH
        provider: arn:aws:bedrock-agentcore:us-east-1:123456789012:token-vault/default/oauth2credentialprovider/spotify
        grantType: AUTHORIZATION_CODE
        scopes:
          - playlist-read-private
        defaultReturnUrl: https://myapp.example.com/callback
        customParameters:
          access_type: offline

    weather:
      openapi: ./openapi/weather.yml
      credentials:
        type: API_KEY
        provider: arn:aws:bedrock-agentcore:${aws:region}:${aws:accountId}:token-vault/default/apikeycredentialprovider/weather
        location: HEADER
        parameterName: X-API-Key
```

`provider` is a string that must be an ARN. Serverless Framework variables resolve before deployment, so the ARN can be built from `${aws:region}` and `${aws:accountId}`, as in the `weather` tool, or read with `${ssm:...}` or `${env:...}`. A CloudFormation intrinsic function such as `!Sub` doesn't match the `serverless.yml` schema, which expects an ARN string. Replace `YOUR_API_KEY` with the key the API issued to you.

| Key                | Applies to         | Required | Value                                                                                       |
| ------------------ | ------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `type`             | All                | No       | `GATEWAY_IAM_ROLE` (default), `OAUTH` or `API_KEY`                                          |
| `provider`         | `OAUTH`, `API_KEY` | Yes      | ARN of the credential provider                                                              |
| `scopes`           | `OAUTH`            | Yes      | Up to 100 scopes, 1 to 64 characters each                                                   |
| `grantType`        | `OAUTH`            | No       | `AUTHORIZATION_CODE` (a user authorizes) or `CLIENT_CREDENTIALS` (the client ID and secret) |
| `defaultReturnUrl` | `OAUTH`            | No       | Where the user returns after authorizing, up to 2,048 characters                            |
| `customParameters` | `OAUTH`            | No       | Up to 10 extra parameters for the authorization request                                     |
| `location`         | `API_KEY`          | No       | `HEADER` or `QUERY_PARAMETER`: where the gateway puts the key                               |
| `parameterName`    | `API_KEY`          | No       | Header or query parameter name, 1 to 64 characters                                          |
| `prefix`           | `API_KEY`          | No       | Text before the key, such as `Bearer`, 1 to 64 characters                                   |

The Framework sets no default for the optional keys: a key you leave out is left out of the gateway target. To control where the gateway sends the API key, set `location` and `parameterName`.

When a gateway has an `OAUTH` or `API_KEY` tool, its generated role can also read tokens and keys from the AgentCore token vault and workload identities, and secrets whose names start with `bedrock-agentcore-identity`.

## Group tools into gateways

To give agents different tool sets or different inbound authorization, define gateways under `ai.gateways` and select one per agent with `gateway`:

```yaml
ai:
  tools:
    calculator:
      function: calculator
      toolSchema: ./tools/calculator.json
    orders:
      function: ordersHandler
      toolSchema: ./tools/orders.json

  gateways:
    public:
      tools:
        - calculator
    internal:
      tools:
        - calculator
        - orders

  agents:
    storefront:
      gateway: public
    support:
      gateway: internal
```

When `ai.gateways` is defined:

- No default gateway is created. An agent gets tools only from the gateway its `gateway` key names; an agent without `gateway` gets none.
- Tools that no gateway lists aren't deployed. A tool listed in several gateways gets one target in each.
- Every name in `tools` must exist in `ai.tools`, and every agent's `gateway` must exist in `ai.gateways`; the deployment stops otherwise.

## Gateway authorization

`authorizer` controls who can call a gateway defined in `ai.gateways`:

| Value               | Callers                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| `AWS_IAM` (default) | AWS principals that sign requests with SigV4 and have `bedrock-agentcore:InvokeGateway` |
| `CUSTOM_JWT`        | Clients with an access token from your OpenID Connect provider                          |
| `NONE`              | Anyone who has the gateway URL                                                          |

The generated agent role allows `bedrock-agentcore:InvokeGateway` on the agent's gateway. `AWS_IAM` and `NONE` work as strings; `CUSTOM_JWT` needs the object form with a `jwt` block:

```yaml
ai:
  gateways:
    partners:
      authorizer:
        type: CUSTOM_JWT
        jwt:
          discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXAMPLE/.well-known/openid-configuration
          allowedClients:
            - partner-app-client-id
          allowedScopes:
            - tools/invoke
      tools:
        - orders
```

The `jwt` block takes the same keys as an agent's JWT authorizer: `discoveryUrl` (required), `allowedAudience`, `allowedClients`, `allowedScopes` and `customClaims`; see [Require JWT authorization for an agent](./runtime.md#require-jwt-authorization-for-an-agent).

## Gateway MCP settings

`protocol` sets the gateway's MCP options:

```yaml
ai:
  gateways:
    internal:
      protocol:
        instructions: Use the orders tools for any question about an order.
        searchType: SEMANTIC
        supportedVersions:
          - '2025-11-25'
      tools:
        - orders
```

| Key                 | Value                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| `type`              | `MCP`, the only value and the default                                      |
| `instructions`      | Guidance for the agent on using the gateway's tools, 1 to 2,048 characters |
| `searchType`        | `SEMANTIC` turns on semantic search over the gateway's tools               |
| `supportedVersions` | MCP protocol versions the gateway accepts                                  |

## Call gateway tools from agent code

The gateway serves MCP over Streamable HTTP at `BEDROCK_AGENTCORE_GATEWAY_URL`. An `AWS_IAM` gateway accepts only SigV4-signed requests, so connect with an MCP client that signs requests with the agent's credentials and the gateway's Region. The examples in this section take the Region from the gateway URL, `https://<gateway-id>.gateway.bedrock-agentcore.<region>.amazonaws.com/mcp`, so they don't depend on a Region variable in the agent's environment.

The gateway lists each tool as `<target>___<tool>`: the tool's key in `ai.tools`, three underscores, and the tool name. The `add` tool of the `calculator` tool in the [example at the top of this page](#agentcore-gateway-tools-for-agents) is `calculator___add`.

### Call gateway tools from a Python agent

This `agent.py` completes the example at the top of this page. The entrypoint is `async`: the AgentCore Python SDK awaits an `async def` entrypoint, so the agent can use the asynchronous MCP client directly. On each invocation, it connects to the gateway, lists the tools and calls `calculator___add` with the request's numbers:

```python
# agent.py
import os
from urllib.parse import urlparse

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from mcp import ClientSession
from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client

app = BedrockAgentCoreApp()

GATEWAY_URL = os.environ["BEDROCK_AGENTCORE_GATEWAY_URL"]
GATEWAY_REGION = urlparse(GATEWAY_URL).hostname.split(".")[-3]


@app.entrypoint
async def invoke(payload, context):
    client = aws_iam_streamablehttp_client(
        endpoint=GATEWAY_URL,
        aws_region=GATEWAY_REGION,
        aws_service="bedrock-agentcore",
    )
    async with client as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            listed = await session.list_tools()
            result = await session.call_tool(
                "calculator___add",
                {"a": payload.get("a", 2), "b": payload.get("b", 3)},
            )
    return {
        "tools": [tool.name for tool in listed.tools],
        "result": result.content[0].text,
    }


if __name__ == "__main__":
    app.run()
```

List the agent's dependencies in `requirements.txt` in the service directory, next to `serverless.yml`; the Framework installs them as Linux ARM64 wheels into the agent's package, as described in [Deploy a Python agent as code](./runtime.md#deploy-a-python-agent-as-code):

```text
bedrock-agentcore
mcp
mcp-proxy-for-aws
```

Deploy the service and invoke the agent:

```bash
serverless deploy
```

```bash
serverless invoke --agent assistant --data '{"a": 2, "b": 3}'
```

`serverless invoke --agent` prints the response body as the agent returns it: here the JSON object from the entrypoint, with `tools` set to `["calculator___add"]` and `result` set to the text of the tool result's first content item. To also print the AgentCore session ID, add `--debug`.

### Call gateway tools from a JavaScript agent

In JavaScript, use `@modelcontextprotocol/sdk` with a fetch function that signs requests with `aws4fetch` and the credentials from `@aws-sdk/credential-provider-node`. Add the three packages to the agent's `package.json`:

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { defaultProvider } from '@aws-sdk/credential-provider-node'
import { AwsV4Signer } from 'aws4fetch'

const GATEWAY_URL = process.env.BEDROCK_AGENTCORE_GATEWAY_URL
const GATEWAY_REGION = new URL(GATEWAY_URL).hostname.split('.').at(-3)

async function signedFetch(url, init = {}) {
  const credentials = await defaultProvider()()
  const signer = new AwsV4Signer({
    url: url.toString(),
    method: init.method ?? 'POST',
    headers: init.headers,
    body: init.body,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    service: 'bedrock-agentcore',
    region: GATEWAY_REGION,
  })
  const signed = await signer.sign()
  return fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    body: init.body,
  })
}

export async function listGatewayTools() {
  const transport = new StreamableHTTPClientTransport(new URL(GATEWAY_URL), {
    fetch: signedFetch,
  })
  const client = new Client({ name: 'my-agent', version: '1.0.0' })
  await client.connect(transport)
  const { tools } = await client.listTools()
  return tools
}
```

Agent frameworks load these tools directly: LangChain with `langchain-mcp-adapters` (Python) or `@langchain/mcp-adapters` (JavaScript), and Strands Agents with its MCP client.

## IAM roles for gateways

Each gateway gets a generated role named `<service>_<gateway>_gateway_role_<stage>` (truncated to 48 characters) that allows:

- `lambda:InvokeFunction` on functions in the stack's account and Region, for function tools.
- CloudWatch Logs under `/aws/bedrock-agentcore/`.
- `kms:Decrypt`, `kms:Encrypt`, `kms:GenerateDataKey` and `kms:DescribeKey` on `kmsKey`, when set.
- The token vault, workload identity and secret access described in [Authenticate tools to external APIs](#authenticate-tools-to-external-apis), when needed.

A gateway in `ai.gateways` takes the same `role` settings as an agent: an object with `name`, `statements`, `managedPolicies`, `permissionsBoundary` and `tags` to customize the generated role, or an ARN, a logical ID or a CloudFormation intrinsic to use your own role. See [IAM role for an agent](./runtime.md#iam-role-for-an-agent). A function given by `arn` in another account or Region needs two more permissions: a `role.statements` entry that allows `lambda:InvokeFunction` on its ARN, and a resource-based policy on the function that lets the gateway role invoke it. Only a gateway in `ai.gateways` can add statements; the default gateway's role can't be customized, so put such tools in a gateway under `ai.gateways`.

## `ai.gateways` and `ai.tools` configuration reference

Each entry under `ai.gateways` takes:

| Key              | Type             | Default        | Value                                                           |
| ---------------- | ---------------- | -------------- | --------------------------------------------------------------- |
| `tools`          | list of strings  | None           | Names of tools in `ai.tools`                                    |
| `authorizer`     | string or object | `AWS_IAM`      | See [Gateway authorization](#gateway-authorization)             |
| `protocol`       | object           | `type: MCP`    | See [Gateway MCP settings](#gateway-mcp-settings)               |
| `description`    | string           | None           | 1 to 200 characters                                             |
| `kmsKey`         | string           | None           | Full KMS key ARN, `arn:aws:kms:<region>:<account>:key/<key-id>` |
| `exceptionLevel` | string           | None           | `DEBUG` returns detailed error messages to callers              |
| `role`           | string or object | Generated role | See [IAM roles for gateways](#iam-roles-for-gateways)           |
| `tags`           | map of strings   | None           | Tags on the gateway                                             |

Each entry under `ai.tools` takes exactly one of `function`, `openapi`, `smithy` or `mcp`, plus:

| Key           | Type           | Value                                                                                                                                                                                                              |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `toolSchema`  | list or string | Required for `function` tools: a list of tool definitions, or the path of a JSON file, relative to the service directory, that holds one definition or a list. See [Lambda function tools](#lambda-function-tools) |
| `credentials` | object         | See [Authenticate tools to external APIs](#authenticate-tools-to-external-apis)                                                                                                                                    |
| `description` | string         | 1 to 200 characters                                                                                                                                                                                                |

Enum values are case-insensitive, except in `customClaims`, which must be uppercase. For a gateway named `internal`, the stack outputs `AgentCoreGatewayInternalArn`, `AgentCoreGatewayInternalId` and `AgentCoreGatewayInternalUrl`; the default gateway's outputs are `AgentCoreGatewayArn`, `AgentCoreGatewayId` and `AgentCoreGatewayUrl`.

## Examples

- [LangGraph with gateway tools (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-gateway) and [(Python)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/langgraph-gateway): a Lambda tool on the default gateway.
- [Multiple gateways (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-multi-gateway) and [(Python)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/langgraph-multi-gateway): gateways with different authorization.
- More in the [Amazon Bedrock AgentCore examples](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore).

## Related pages

- [AgentCore Runtime agents](./runtime.md): the agent settings, including `gateway`.
- [AgentCore Memory](./memory.md): store conversations.
- [Amazon Bedrock AgentCore Gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html) in the AgentCore developer guide.
