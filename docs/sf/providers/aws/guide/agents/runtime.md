<!--
title: AgentCore Runtime Agents
description: Deploy an AI agent to Amazon Bedrock AgentCore Runtime from a Dockerfile, source, an image or Python code, and set its network, auth and IAM role.
short_title: Runtime
keywords:
  [
    'Serverless Framework',
    'Amazon Bedrock AgentCore Runtime',
    'deploy AI agent',
    'AgentCore Docker',
    'AgentCore VPC',
    'AgentCore JWT authorizer',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/runtime)

<!-- DOCS-SITE-LINK:END -->

# AgentCore Runtime agents

Each entry under `ai.agents` in `serverless.yml` deploys one agent to Amazon Bedrock AgentCore Runtime, the managed, session-isolated host for AI agents. The Framework builds or packages the agent, creates its execution role and deploys it with CloudFormation; this page covers the deployment methods and every `ai.agents` setting.

The smallest agent is an empty entry. With a `Dockerfile` in the service directory, the Framework builds it, pushes the image to Amazon ECR and deploys the runtime:

```yaml
# serverless.yml
service: my-agent

provider:
  name: aws
  region: us-east-1

ai:
  agents:
    assistant: {}
```

Write `{}` for an agent without settings: an entry with no value isn't a valid agent. The agent must follow the [AgentCore Runtime service contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html): an ARM64 container listening on `0.0.0.0`, port 8080, with `POST /invocations` and `GET /ping` for the default `HTTP` protocol. The AgentCore SDKs for [Python](https://github.com/aws/bedrock-agentcore-sdk-python) and JavaScript (`bedrock-agentcore`) implement it.

## Choose a deployment method

The keys you set on an agent select how the Framework deploys it:

| Method                             | Set                                      | Docker needed | Languages       |
| ---------------------------------- | ---------------------------------------- | ------------- | --------------- |
| Dockerfile                         | A `Dockerfile`, or `artifact.image.file` | Yes           | Any             |
| Build from source (Buildpacks)     | Nothing: no `Dockerfile`, no `handler`   | Yes           | Node.js, Python |
| Pre-built image                    | `artifact.image` as an image URI         | No            | Any             |
| Python code deployment             | `handler`                                | No            | Python          |
| Existing code package in Amazon S3 | `handler` and `artifact.s3`              | No            | Python          |

`handler` and `artifact.image` can't be set on the same agent.

## Deploy an agent from a Dockerfile

When the service directory contains a `Dockerfile`, `serverless deploy` builds the image for `linux/arm64`, creates the ECR repository `<service>-<agent>` (lowercase) if it doesn't exist, pushes the image and deploys the runtime. A Node.js `Dockerfile`:

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "index.js"]
```

A Python `Dockerfile`:

```dockerfile
FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "agent.py"]
```

To build from another file, context or repository, set `artifact.image`:

```yaml
ai:
  agents:
    assistant:
      artifact:
        image:
          path: ./agent
          file: Dockerfile.agent
          repository: my-agent-repo
          buildArgs:
            APP_ENV: production
```

- `artifact.image.path`: the build context, relative to the service directory. Default: `.`.
- `artifact.image.file`: the Dockerfile, relative to `path`. Default: `Dockerfile`.
- `artifact.image.repository`: the ECR repository name, created during `serverless deploy` if it doesn't exist. Default: `<service>-<agent>`, lowercase. `serverless remove` doesn't delete the repository.
- `artifact.image.buildArgs`: `--build-arg` values, as a map of strings.

## Build an agent image from source without a Dockerfile

When an agent has neither `handler` nor `artifact.image` and the service directory has no `Dockerfile`, the Framework builds the image with Cloud Native Buildpacks, using the `heroku/builder:24` builder for `linux/arm64`. The project needs:

- Node.js: `package.json` and a lockfile (`package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock` or `pnpm-lock.yaml`); the deployment stops without one. The buildpack starts the `start` script of `package.json`, and selects the Node.js version from `engines.node` (default: the latest LTS release).
- Python: `requirements.txt`, `poetry.lock` or `uv.lock`, as the [Heroku Python buildpack](https://github.com/heroku/buildpacks-python) requires.

To use another builder image, for example a digest-pinned copy in a registry you control, set `artifact.image.builder`:

```yaml
ai:
  agents:
    assistant:
      artifact:
        image:
          builder: 123456789012.dkr.ecr.us-east-1.amazonaws.com/builders/heroku-builder@sha256:IMAGE_DIGEST
```

Replace `IMAGE_DIGEST` with the digest of your copy of the builder.

## Deploy a pre-built agent image

To deploy an image that your own pipeline builds and pushes, set `artifact.image` to its URI. The Framework builds nothing and grants the generated role pull access to that repository:

```yaml
ai:
  agents:
    assistant:
      artifact:
        image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:1.4.0
```

`artifact.image` also accepts the name of an image in `provider.ecr.images`; the Framework builds and pushes that image and deploys its URI.

## Deploy a Python agent as code

To deploy a Python agent without Docker, set `handler` to the entry-point file. The Framework installs the dependencies from `requirements.txt` as Linux ARM64 wheels for the agent's Python version, zips the service directory and uploads the package to the deployment bucket:

```yaml
ai:
  agents:
    assistant:
      handler: agent.py
      runtime: python3.14
```

- `handler`: the Python file AgentCore runs, relative to the service directory. The file can be in a subdirectory, such as `handler: agent/main.py`: the package holds the service directory, so the path inside the package is the same.
- `runtime`: `python3.10`, `python3.11`, `python3.12`, `python3.13` or `python3.14`. Default: `python3.13`.

The Framework reads `requirements.txt` from the service directory, next to `serverless.yml`, also when `handler` is in a subdirectory, and installs the dependencies at the root of the package.

AgentCore limits a code package to 250 MB zipped and 750 MB unzipped. To choose the files in the package, use `package.patterns` as for [Lambda function packaging](../packaging.md); `package.include` and `package.exclude` are also accepted. The Framework always leaves out `__pycache__`, `*.pyc`, `*.pyo`, `.pytest_cache` and `*.egg-info`:

```yaml
ai:
  agents:
    assistant:
      handler: agent.py
      package:
        patterns:
          - '!tests/**'
          - '!docs/**'
```

To deploy a zip file you built yourself, set `package.artifact` to its path; the Framework uploads it as-is.

### Use a code package that is already in Amazon S3

To point the runtime at a package you manage in your own bucket, add `artifact.s3` to an agent with `handler`. The Framework doesn't package or upload anything, and grants the generated role `s3:GetObject` and `s3:GetObjectVersion` on that object:

```yaml
ai:
  agents:
    assistant:
      handler: agent.py
      runtime: python3.14
      artifact:
        s3:
          bucket: my-artifacts-bucket
          key: agents/assistant.zip
          versionId: 3HL4kqtJlcpXroDTDmJ.rmSpXd3dIbrHY
```

`bucket` and `key` are required; `versionId` pins an object version.

## Invoke an agent and read its logs

`serverless invoke --agent` (`-a`) sends a request to the agent's default endpoint and prints the response, streaming it when the agent responds with server-sent events:

```bash
serverless invoke --agent assistant --data '{"prompt": "Hello"}'
```

- `--data` (`-d`) or `--path` (`-p`, a file relative to the service): input that parses as JSON is sent as-is; any other text is sent as `{"prompt": "<text>"}`.
- `--session-id`: the AgentCore session to continue, at least 33 characters. Requests with the same session ID reach the same session.

`serverless logs --agent` reads the runtime's CloudWatch log group `/aws/bedrock-agentcore/runtimes/<runtime ID>-DEFAULT`, with the same `--tail`, `--startTime`, `--filter` and `--interval` options as function logs:

```bash
serverless logs --agent assistant --tail
```

To run the agent on your machine against its deployed resources, use [Dev Mode for AgentCore agents](./dev.md).

## Configure the agent's network

`network.mode` decides how the runtime reaches other resources:

- `PUBLIC` (default): the runtime has internet access.
- `VPC`: the runtime gets network interfaces in your subnets, to reach private resources such as databases.

```yaml
ai:
  agents:
    assistant:
      network:
        mode: VPC
        subnets:
          - subnet-0123456789abcdef0
          - subnet-0123456789abcdef1
        securityGroups:
          - sg-0123456789abcdef0
```

In `VPC` mode, `subnets` and `securityGroups` are both required, 1 to 16 IDs each. AgentCore creates the network interfaces through the `AWSServiceRoleForBedrockAgentCoreNetwork` service-linked role, which it creates on first use. The subnets must be in the [Availability Zones that AgentCore supports](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-vpc.html#agentcore-supported-azs). For internet access, use private subnets with a route to a NAT gateway; a public subnet doesn't give the runtime internet access. Without internet access, the VPC needs endpoints for Amazon ECR (`ecr.api` and `ecr.dkr`), Amazon S3 (gateway endpoint) and CloudWatch Logs.

## Require JWT authorization for an agent

By default, callers authenticate with AWS SigV4 and need the `bedrock-agentcore:InvokeAgentRuntime` permission. To accept OAuth access tokens from an OpenID Connect provider such as Amazon Cognito, Auth0 or Okta instead, set a `CUSTOM_JWT` authorizer:

```yaml
ai:
  agents:
    assistant:
      authorizer:
        type: CUSTOM_JWT
        jwt:
          discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXAMPLE/.well-known/openid-configuration
          allowedClients:
            - my-app-client-id
          allowedScopes:
            - agent/invoke
```

The `jwt` block takes:

| Key               | Required | Value                                                                            |
| ----------------- | -------- | -------------------------------------------------------------------------------- |
| `discoveryUrl`    | Yes      | The provider's OIDC discovery URL, ending in `/.well-known/openid-configuration` |
| `allowedAudience` | No       | List of accepted `aud` claim values, at least one                                |
| `allowedClients`  | No       | List of accepted `client_id` values, at least one                                |
| `allowedScopes`   | No       | List of scopes the token must carry, at least one                                |
| `customClaims`    | No       | List of claim rules, described below                                             |

Each `customClaims` rule checks one claim of the token:

```yaml
ai:
  agents:
    assistant:
      authorizer:
        type: CUSTOM_JWT
        jwt:
          discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXAMPLE/.well-known/openid-configuration
          customClaims:
            - inboundTokenClaimName: department
              inboundTokenClaimValueType: STRING
              authorizingClaimMatchValue:
                claimMatchOperator: EQUALS
                claimMatchValue:
                  matchValueString: engineering
```

- `inboundTokenClaimValueType`: `STRING` or `STRING_ARRAY`.
- `claimMatchOperator`: `EQUALS`, `CONTAINS` or `CONTAINS_ANY`.
- `claimMatchValue`: `matchValueString` for one value, or `matchValueStringList` for a list.

`authorizer` also accepts the strings `NONE` and `AWS_IAM`, and the object form with `type: NONE` or `type: AWS_IAM`; all of them keep SigV4 authentication. A `CUSTOM_JWT` authorizer needs the `jwt` block.

## Session lifecycle settings

AgentCore runs each session in its own microVM. `lifecycle` sets, in seconds, when AgentCore stops it:

```yaml
ai:
  agents:
    assistant:
      lifecycle:
        idleRuntimeSessionTimeout: 900
        maxLifetime: 3600
```

| Key                         | Range      | Default | Effect                                                    |
| --------------------------- | ---------- | ------- | --------------------------------------------------------- |
| `idleRuntimeSessionTimeout` | 60 - 28800 | 900     | Stops a session after this many seconds without a request |
| `maxLifetime`               | 60 - 28800 | 28800   | Stops a session this many seconds after it started        |

`idleRuntimeSessionTimeout` must be less than or equal to `maxLifetime`. A request with the same session ID after a stop starts a new microVM. For how AgentCore applies these values, see [Configure lifecycle settings](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-lifecycle-settings.html).

## Agent protocol

`protocol` tells AgentCore how to talk to the container:

```yaml
ai:
  agents:
    toolServer:
      protocol: MCP
```

| Value            | Use it for                       | The container serves                        |
| ---------------- | -------------------------------- | ------------------------------------------- |
| `HTTP` (default) | Agents invoked with a prompt     | Port 8080: `POST /invocations`, `GET /ping` |
| `MCP`            | An MCP server that exposes tools | Port 8000: `/mcp`                           |
| `A2A`            | Agent-to-agent communication     | Port 9000: `/`                              |

[Dev Mode for AgentCore agents](./dev.md) chats with `HTTP` agents.

## Runtime endpoints

AgentCore gives every runtime a `DEFAULT` endpoint that serves the latest version; `serverless invoke --agent` uses it. To add named endpoints, for example one pinned to a tested version, list them under `endpoints`:

```yaml
ai:
  agents:
    assistant:
      endpoints:
        - name: production
          description: Tracks the latest version
        - name: staging
          version: '1'
          description: Pinned to version 1
```

| Key           | Required | Value                                                                                                             |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`        | No       | Endpoint name. Default: `default`. The AWS name is `<service>_<agent>_<name>_<stage>`, truncated to 48 characters |
| `version`     | No       | Runtime version to pin, as a string (`'1'`). Omit it to follow the latest version                                 |
| `description` | No       | Up to 256 characters                                                                                              |

Each endpoint is an `AWS::BedrockAgentCore::RuntimeEndpoint` resource, and its ARN is a stack output.

## Agent environment variables

`environment` sets variables in the agent's container or code runtime:

```yaml
ai:
  agents:
    assistant:
      environment:
        MODEL_ID: us.anthropic.claude-sonnet-4-5-20250929-v1:0
        LOG_LEVEL: INFO
        ORDERS_TABLE: !Ref OrdersTable
```

- Values are strings or CloudFormation references (`!Ref`, `!GetAtt`, `!ImportValue` and others), resolved at deploy time.
- Every agent inherits `provider.environment`; an agent's own key overrides the provider value.
- The Framework adds `BEDROCK_AGENTCORE_MEMORY_ID` when the agent has [memory](./memory.md) and `BEDROCK_AGENTCORE_GATEWAY_URL` when it has [gateway tools](./gateway.md).
- AgentCore accepts up to 50 variables, including the ones the Framework adds, with names up to 100 characters and values up to 5,000 characters.
- Keep secrets out of plain values: read them at runtime from AWS Secrets Manager or Parameter Store, and grant access with `role.statements`.

For on-demand Bedrock models, use an [inference profile ID](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html), such as the `us.` profile in the preceding example.

## Pass request headers to the agent

AgentCore forwards only allowlisted request headers to the agent. List them under `requestHeaders.allowlist`:

```yaml
ai:
  agents:
    assistant:
      requestHeaders:
        allowlist:
          - X-Trace-Id
          - X-Api-Key
```

The allowlist takes 1 to 20 header names, and each forwarded value can be up to 4 KB. Headers that start with `x-amz-`, headers that start with `x-amzn-` (except `X-Amzn-Bedrock-AgentCore-Runtime-Custom-`) and standard headers such as `Content-Type` and `Host` can't be allowlisted. `Authorization` can be forwarded only with a `CUSTOM_JWT` authorizer. The full list is in [Pass custom headers to AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-header-allowlist.html).

## IAM role for an agent

Without `role`, the Framework creates an execution role for each agent, named `<service>_<agent>_runtime_role_<stage>` (truncated to 48 characters). AgentCore assumes it only on behalf of resources in your account. The role allows:

- CloudWatch Logs for log groups under `/aws/bedrock-agentcore/runtimes/`.
- Amazon Bedrock `InvokeModel`, `InvokeModelWithResponseStream` and `GetInferenceProfile` on foundation models and inference profiles.
- AWS Marketplace `ViewSubscriptions` and `Subscribe`, which enabling a third-party model for the first time requires.
- AWS X-Ray traces and CloudWatch metrics in the `bedrock-agentcore` namespace.
- The AWS-managed browser and code interpreter (`aws.browser.v1`, `aws.codeinterpreter.v1`).
- ECR image pull, when the agent runs a container image.
- Read access to the `artifact.s3` object, when set.
- The agent's memory and gateway, when `memory` or `gateway` applies.

A [custom browser](./browser.md) or [custom code interpreter](./code-interpreter.md) needs its own statements.

To add permissions, set `role` to an object; the Framework still creates the role and merges your settings:

```yaml
ai:
  agents:
    assistant:
      role:
        name: my-agent-role
        statements:
          - Effect: Allow
            Action: secretsmanager:GetSecretValue
            Resource: arn:aws:secretsmanager:us-east-1:123456789012:secret:my-agent-*
        managedPolicies:
          - arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess
        permissionsBoundary: arn:aws:iam::123456789012:policy/MyPermissionsBoundary
        tags:
          CostCenter: ai-team
```

| Key                   | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| `name`                | Role name, 1 to 64 characters, replacing the generated name                 |
| `statements`          | IAM policy statements added to the role's inline policy (`Effect` required) |
| `managedPolicies`     | Managed policy ARNs to attach                                               |
| `permissionsBoundary` | Permissions boundary policy ARN                                             |
| `tags`                | Tags on the role                                                            |

To use a role you manage, set `role` to its ARN, to the logical ID of a role in `resources`, or to a CloudFormation intrinsic (`Ref`, `Fn::GetAtt`, `Fn::ImportValue`, `Fn::Sub`, `Fn::Join`). The Framework then creates no role, and your role must trust `bedrock-agentcore.amazonaws.com` and grant what the agent uses:

```yaml
ai:
  agents:
    assistant:
      role: arn:aws:iam::123456789012:role/MyAgentRole
```

## Agent description and tags

`description` (1 to 1,200 characters) applies to the runtime, and `tags` (a map of strings) apply to the runtime and its endpoints:

```yaml
ai:
  agents:
    assistant:
      description: Customer service agent with memory and tools
      tags:
        Team: ai
        Project: customer-service
```

## Resources and stack outputs for an agent

For an agent named `assistant`, the Framework adds these resources to the stack:

- `AssistantRuntime`: the `AWS::BedrockAgentCore::Runtime`, named `<service>_assistant_<stage>`, truncated to 48 characters, with dashes turned into underscores.
- `AssistantRuntimeRole`: the generated execution role, unless `role` points to a role you manage.
- One `AWS::BedrockAgentCore::RuntimeEndpoint` per entry in `endpoints`.

The stack outputs `AssistantRuntimeArn` (exported as `<service>-<stage>-assistant-RuntimeArn`), `AssistantRuntimeId`, `AssistantRuntimeUrl` (the invocation URL) and `AssistantRuntimeRoleArn`. `serverless deploy` and `serverless info` print the invocation URL under `agents`. Agent names with dashes or underscores appear in logical IDs as `Dash` and `Underscore`, as for functions.

## `ai.agents` configuration reference

All keys are optional. Enum values are case-insensitive, except in `customClaims`, which must be uppercase.

| Key                   | Type                 | Default                    | Section                                                                                             |
| --------------------- | -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `handler`             | string               | None                       | [Deploy a Python agent as code](#deploy-a-python-agent-as-code)                                     |
| `runtime`             | string               | `python3.13`               | [Deploy a Python agent as code](#deploy-a-python-agent-as-code)                                     |
| `package`             | object               | None                       | [Deploy a Python agent as code](#deploy-a-python-agent-as-code)                                     |
| `artifact.image`      | string or object     | `Dockerfile` or Buildpacks | [Deploy an agent from a Dockerfile](#deploy-an-agent-from-a-dockerfile)                             |
| `artifact.s3`         | object               | None                       | [Use a code package that is already in Amazon S3](#use-a-code-package-that-is-already-in-amazon-s3) |
| `protocol`            | `HTTP`, `MCP`, `A2A` | `HTTP`                     | [Agent protocol](#agent-protocol)                                                                   |
| `network`             | object               | `mode: PUBLIC`             | [Configure the agent's network](#configure-the-agents-network)                                      |
| `authorizer`          | string or object     | SigV4                      | [Require JWT authorization for an agent](#require-jwt-authorization-for-an-agent)                   |
| `lifecycle`           | object               | 900 and 28800 seconds      | [Session lifecycle settings](#session-lifecycle-settings)                                           |
| `endpoints`           | list                 | None                       | [Runtime endpoints](#runtime-endpoints)                                                             |
| `environment`         | map                  | `provider.environment`     | [Agent environment variables](#agent-environment-variables)                                         |
| `requestHeaders`      | object               | None                       | [Pass request headers to the agent](#pass-request-headers-to-the-agent)                             |
| `memory`              | string or object     | None                       | [AgentCore Memory](./memory.md)                                                                     |
| `gateway`             | string               | The default gateway        | [AgentCore Gateway tools](./gateway.md)                                                             |
| `role`                | string or object     | Generated role             | [IAM role for an agent](#iam-role-for-an-agent)                                                     |
| `description`, `tags` | string, map          | None                       | [Agent description and tags](#agent-description-and-tags)                                           |

## Examples

The [Amazon Bedrock AgentCore examples](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore) include each deployment method:

- [LangGraph with a Dockerfile (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-basic-dockerfile) and [built from source](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-basic).
- [LangGraph with a Dockerfile (Python)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/langgraph-basic-docker) and [with code deployment](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/langgraph-basic-code).
- [Streaming responses (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-streaming) and an [MCP server runtime](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/mcp-server).

## Related pages

- [AgentCore Gateway tools](./gateway.md): give the agent tools.
- [AgentCore Memory](./memory.md): store conversations.
- [Dev Mode for AgentCore agents](./dev.md): run the agent locally.
- [`serverless.yml` reference: AI Agents](../serverless.yml.md#ai-agents).
