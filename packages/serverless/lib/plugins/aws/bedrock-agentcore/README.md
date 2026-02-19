# Bedrock AgentCore Plugin

Deploy AWS Bedrock AgentCore resources with Serverless Framework.

## Features

- Define AgentCore resources in `serverless.yml` using the `ai` top-level property
- Supports AgentCore resource types:
  - **Runtime Agents** (`ai.agents`) - Deploy containerized or code-deployed AI agents
  - **Memory** (`ai.memory`) - Conversation history with semantic search
  - **Tools** (`ai.tools`) - Lambda, OpenAPI, Smithy, and MCP tool definitions
  - **Gateways** (`ai.gateways`) - Route tools to agents via MCP protocol
  - **Browsers** (`ai.browsers`) - Web browsing capabilities
  - **CodeInterpreters** (`ai.codeInterpreters`) - Sandboxed code execution
- Auto-generates IAM roles with least-privilege permissions
- Automatic tagging and naming conventions
- CloudFormation outputs for cross-stack references

## Quick Start

```yaml
service: my-agent

provider:
  name: aws
  region: us-east-1

ai:
  agents:
    myAgent:
      description: My AI agent
      artifact:
        image:
          path: .
          file: Dockerfile
      protocol: http
      network:
        mode: public
```

## Configuration Structure

The `ai` top-level property has six sections. Each resource type lives in its own section — there is no `type` discriminator property.

```yaml
ai:
  agents: # Runtime agent definitions
  memory: # Shared memory definitions
  tools: # Tool definitions (Lambda, OpenAPI, Smithy, MCP)
  gateways: # Gateway definitions with tool assignments
  browsers: # Custom browser definitions
  codeInterpreters: # Custom code interpreter definitions
```

## Resource Types

### Runtime Agents (`ai.agents`)

Deploy AI agents as containerized services or Python code packages.

#### Docker Deployment

The framework auto-detects a `Dockerfile` in the current directory. For the simplest case:

```yaml
ai:
  agents:
    chatbot: {}
```

With explicit Docker configuration:

```yaml
ai:
  agents:
    myAgent:
      description: My AI agent
      artifact:
        image:
          path: .
          file: Dockerfile
          repository: my-agent
          buildArgs:
            NODE_ENV: production
      protocol: http
      network:
        mode: public
      authorizer:
        type: custom_jwt
        jwt:
          discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx/.well-known/openid-configuration
          allowedAudience:
            - my-client-id
      requestHeaders:
        allowlist:
          - X-User-Id
          - X-Session-Id
          - Authorization
      lifecycle:
        idleRuntimeSessionTimeout: 900
        maxLifetime: 28800
```

#### Pre-built Container Image

```yaml
ai:
  agents:
    myAgent:
      artifact:
        image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest
```

#### Python Code Deployment (No Docker)

For Python agents, deploy code directly without building a container:

```yaml
ai:
  agents:
    myAgent:
      handler: agent.py
      runtime: python3.13
```

With custom S3 artifact location:

```yaml
ai:
  agents:
    myAgent:
      handler: agent.py
      runtime: python3.12
      artifact:
        s3:
          bucket: my-bucket
          key: agent.zip
```

#### Runtime Agent Properties

| Property                              | Required | Description                                                              |
| ------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `description`                         | No       | Agent description (max 1200 chars)                                       |
| `artifact.image`                      | No       | Container image URI (string) or build config (object)                    |
| `artifact.image.path`                 | No       | Docker build context path (default: `.`)                                 |
| `artifact.image.file`                 | No       | Dockerfile name (default: `Dockerfile`)                                  |
| `artifact.image.repository`           | No       | ECR repository name                                                      |
| `artifact.image.buildArgs`            | No       | Docker build arguments (key-value pairs)                                 |
| `artifact.s3.bucket`                  | No       | S3 bucket for code artifact                                              |
| `artifact.s3.key`                     | No       | S3 key for code artifact                                                 |
| `handler`                             | No       | Python entry point file (e.g., `agent.py`)                               |
| `runtime`                             | No       | `python3.10`, `python3.11`, `python3.12`, or `python3.13`                |
| `protocol`                            | No       | `http`, `mcp`, or `a2a`                                                  |
| `network.mode`                        | No       | `public` or `vpc`                                                        |
| `network.subnets`                     | No       | VPC subnet IDs (required for vpc mode)                                   |
| `network.securityGroups`              | No       | VPC security group IDs (required for vpc mode)                           |
| `authorizer`                          | No       | String (`none`, `custom_jwt`) or object with `type` and `jwt`            |
| `authorizer.jwt.discoveryUrl`         | No       | OIDC discovery URL (\*required for custom_jwt)                           |
| `authorizer.jwt.allowedAudience`      | No       | Array of allowed audience values                                         |
| `authorizer.jwt.allowedClients`       | No       | Array of allowed client IDs                                              |
| `lifecycle.idleRuntimeSessionTimeout` | No       | Session idle timeout in seconds (60-28800)                               |
| `lifecycle.maxLifetime`               | No       | Max session lifetime in seconds (60-28800)                               |
| `requestHeaders.allowlist`            | No       | Headers to forward to runtime (max 20)                                   |
| `memory`                              | No       | Inline memory config (object) or reference to `ai.memory` entry (string) |
| `gateway`                             | No       | Reference to a gateway defined in `ai.gateways`                          |
| `environment`                         | No       | Environment variables (same as Lambda)                                   |
| `package.patterns`                    | No       | File include/exclude patterns for packaging                              |
| `package.artifact`                    | No       | Pre-built artifact path                                                  |
| `endpoints`                           | No       | Runtime endpoint definitions                                             |
| `role`                                | No       | IAM role ARN (string) or customization object                            |
| `tags`                                | No       | Resource tags (key-value pairs)                                          |

One of `artifact.image`, `handler`, or auto-detected Dockerfile is required.

#### Agent Authorizer

The authorizer can be a string shorthand or an object:

```yaml
# String shorthand — no auth
authorizer: none

# Object form — JWT auth
authorizer:
  type: custom_jwt
  jwt:
    discoveryUrl: https://example.com/.well-known/openid-configuration
    allowedAudience:
      - my-client-id
    allowedClients:
      - my-app-client
    allowedScopes:
      - read
      - write
```

Omitting `authorizer` defaults to IAM authentication.

### Memory (`ai.memory`)

Store conversation history with semantic search and summarization. Memory can be defined as a shared resource in `ai.memory` or inline on an agent.

#### Shared Memory

```yaml
ai:
  memory:
    conversationMemory:
      description: Conversation memory with semantic search
      expiration: 90
      strategies:
        - SemanticMemoryStrategy:
            Name: ConversationSearch
            Namespaces:
              - /conversations/{sessionId}

        - SummaryMemoryStrategy:
            Name: SessionSummary
            Namespaces:
              - /sessions/{sessionId}

        - UserPreferenceMemoryStrategy:
            Name: UserPrefs
            Namespaces:
              - /users/{userId}/preferences
```

#### Inline Memory on Agent

```yaml
ai:
  agents:
    chatbot:
      memory:
        expiration: 30
```

#### Memory Properties

| Property        | Required | Description                                   |
| --------------- | -------- | --------------------------------------------- |
| `expiration`    | No       | Days to retain events (3-365, default: 30)    |
| `strategies`    | No       | Memory strategies array                       |
| `description`   | No       | Memory description (max 1200 chars)           |
| `encryptionKey` | No       | KMS key ARN for encryption                    |
| `role`          | No       | IAM role ARN (string) or customization object |
| `tags`          | No       | Resource tags (key-value pairs)               |

#### Memory Strategy Types

**SemanticMemoryStrategy** - Semantic search over conversations:

```yaml
- SemanticMemoryStrategy:
    Name: Search
    Namespaces:
      - /sessions/{sessionId}
```

**SummaryMemoryStrategy** - Summarize long conversations:

```yaml
- SummaryMemoryStrategy:
    Name: Summary
    Namespaces:
      - /sessions/{sessionId}
```

**UserPreferenceMemoryStrategy** - Track user preferences:

```yaml
- UserPreferenceMemoryStrategy:
    Name: Preferences
    Namespaces:
      - /users/{userId}
```

**CustomMemoryStrategy** - Custom memory handling:

```yaml
- CustomMemoryStrategy:
    Name: Custom
    Configuration:
      key: value
```

**EpisodicMemoryStrategy** - Episodic memory with reflection:

```yaml
- EpisodicMemoryStrategy:
    Name: Episodes
    Namespaces:
      - /episodes/{sessionId}
    ReflectionConfiguration:
      enabled: true
```

### Tools (`ai.tools`)

Define tools that agents can use via gateways. Four target types are supported.

#### Lambda Function Tool

```yaml
ai:
  tools:
    calculator:
      function: calculatorFunction
      toolSchema:
        - name: calculate
          description: Perform basic arithmetic
          inputSchema:
            type: object
            properties:
              expression:
                type: string
                description: Arithmetic expression
            required:
              - expression

functions:
  calculatorFunction:
    handler: handlers/calculator.handler
    runtime: nodejs24.x
```

#### OpenAPI Tool

```yaml
ai:
  tools:
    weatherApi:
      openapi: ./schemas/weather-api.yml
```

#### Smithy Tool

```yaml
ai:
  tools:
    myService:
      smithy: ./schemas/service.smithy
```

#### MCP Server Tool

```yaml
ai:
  tools:
    knowledge:
      mcp: https://knowledge-mcp.global.api.aws
```

#### Tool Properties

| Property      | Required | Description                                             |
| ------------- | -------- | ------------------------------------------------------- |
| `function`    | No       | Lambda function name (string) or `{ name, arn }` object |
| `openapi`     | No       | OpenAPI schema file path or inline content              |
| `smithy`      | No       | Smithy model file path or inline content                |
| `mcp`         | No       | MCP server HTTPS endpoint URL                           |
| `toolSchema`  | No       | Tool schema array (required for `function` tools)       |
| `credentials` | No       | Credential provider configuration                       |
| `description` | No       | Tool description (max 200 chars)                        |

Exactly one of `function`, `openapi`, `smithy`, or `mcp` should be specified.

#### Tool Credentials

```yaml
ai:
  tools:
    externalApi:
      function: apiFunction
      toolSchema:
        - name: fetch_data
          description: Fetch external data
          inputSchema:
            type: object
            properties:
              query:
                type: string
      credentials:
        type: oauth
        provider: arn:aws:secretsmanager:us-east-1:123456789012:secret:oauth-creds
        scopes:
          - read
          - write
        grantType: client_credentials
```

| Credential Type              | Properties                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `gateway_iam_role` (default) | No additional config needed                                                                 |
| `oauth`                      | `provider` (Token Vault ARN), `scopes`, `grantType`, `defaultReturnUrl`, `customParameters` |
| `api_key`                    | `location` (`header` or `query_parameter`), `parameterName`, `prefix`                       |

### Gateways (`ai.gateways`)

Gateways route tools to agents via MCP protocol. When `ai.tools` is defined without `ai.gateways`, a default gateway is auto-created with all tools assigned.

#### Explicit Gateways

```yaml
ai:
  tools:
    calculator:
      function: calculatorFunction
      toolSchema:
        - name: calculate
          description: Perform arithmetic
          inputSchema:
            type: object
            properties:
              expression:
                type: string
            required:
              - expression

    internalLookup:
      function: internalLookupFunction
      toolSchema:
        - name: lookup_user
          description: Look up internal user info
          inputSchema:
            type: object
            properties:
              userId:
                type: string
            required:
              - userId

  gateways:
    publicGateway:
      authorizer: none
      tools:
        - calculator

    privateGateway:
      authorizer: aws_iam
      tools:
        - internalLookup

  agents:
    publicAgent:
      gateway: publicGateway

    privateAgent:
      gateway: privateGateway
```

#### Default Gateway (Auto-created)

When tools exist but no gateways are defined, a default gateway is created with all tools:

```yaml
ai:
  tools:
    calculator:
      function: calculatorFunction
      toolSchema:
        - name: calculate
          description: Perform arithmetic
          inputSchema:
            type: object
            properties:
              expression:
                type: string

  agents:
    chatbot: {}
```

#### Gateway with JWT Auth

```yaml
ai:
  gateways:
    secureGateway:
      authorizer:
        type: custom_jwt
        jwt:
          discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx/.well-known/openid-configuration
          allowedAudience:
            - my-client-id
          allowedClients:
            - my-app-client
          allowedScopes:
            - read
            - write
      protocol:
        instructions: Use these tools for external API access
        searchType: semantic
      tools:
        - myTool
```

#### Gateway Properties

| Property                     | Required | Description                                                              |
| ---------------------------- | -------- | ------------------------------------------------------------------------ |
| `authorizer`                 | No       | String (`none`, `aws_iam`, `custom_jwt`) or object with `type` and `jwt` |
| `tools`                      | No       | Array of tool names referencing entries in `ai.tools`                    |
| `protocol`                   | No       | MCP protocol configuration                                               |
| `protocol.instructions`      | No       | Instructions for the agent (max 2048 chars)                              |
| `protocol.searchType`        | No       | `semantic`                                                               |
| `protocol.supportedVersions` | No       | Supported MCP versions                                                   |
| `description`                | No       | Gateway description (max 200 chars)                                      |
| `role`                       | No       | IAM role ARN (string) or customization object                            |
| `kmsKey`                     | No       | KMS key ARN for encryption                                               |
| `exceptionLevel`             | No       | `debug`                                                                  |
| `tags`                       | No       | Resource tags (key-value pairs)                                          |

### Browsers (`ai.browsers`)

Define custom browser resources. For the default AWS-managed browser, no configuration is needed — the agent auto-detects it. Custom browsers are for advanced use cases like session recording or VPC mode.

```yaml
ai:
  browsers:
    customBrowser:
      description: Custom browser with session recording
      network:
        mode: public
      signing:
        enabled: true
      recording:
        enabled: true
        s3Location:
          bucket: my-recordings-bucket
          prefix: browser-sessions/
```

| Property                      | Required | Description                                                  |
| ----------------------------- | -------- | ------------------------------------------------------------ |
| `network.mode`                | No       | `public` or `vpc` (default: `public`)                        |
| `network.subnets`             | No       | VPC subnet IDs (required for vpc mode)                       |
| `network.securityGroups`      | No       | VPC security group IDs (required for vpc mode)               |
| `signing.enabled`             | No       | Enable request signing                                       |
| `recording.enabled`           | No       | Enable session recording                                     |
| `recording.s3Location.bucket` | No       | S3 bucket for recordings (\*required when recording enabled) |
| `recording.s3Location.prefix` | No       | S3 prefix for recordings (\*required when recording enabled) |
| `description`                 | No       | Browser description (max 1200 chars)                         |
| `role`                        | No       | IAM role ARN (string) or customization object                |
| `tags`                        | No       | Resource tags (key-value pairs)                              |

### CodeInterpreters (`ai.codeInterpreters`)

Define custom code interpreter resources. For the default AWS-managed code interpreter (sandbox mode), no configuration is needed. Custom interpreters are for public or vpc network modes.

```yaml
ai:
  codeInterpreters:
    publicInterpreter:
      description: Code interpreter with public internet access
      network:
        mode: public
```

| Property                 | Required | Description                                    |
| ------------------------ | -------- | ---------------------------------------------- |
| `network.mode`           | No       | `sandbox` (default), `public`, or `vpc`        |
| `network.subnets`        | No       | VPC subnet IDs (required for vpc mode)         |
| `network.securityGroups` | No       | VPC security group IDs (required for vpc mode) |
| `description`            | No       | CodeInterpreter description (max 1200 chars)   |
| `role`                   | No       | IAM role ARN (string) or customization object  |
| `tags`                   | No       | Resource tags (key-value pairs)                |

## IAM Role Customization

All resource types support IAM role customization. You can provide an existing role ARN or customize the auto-generated role.

#### Existing Role ARN

```yaml
ai:
  agents:
    myAgent:
      role: arn:aws:iam::123456789012:role/MyCustomRole
```

#### Role Customization

Add custom IAM statements, managed policies, or a permissions boundary to the auto-generated role:

```yaml
ai:
  agents:
    myAgent:
      role:
        name: MyAgentRole
        statements:
          - Effect: Allow
            Action:
              - s3:GetObject
            Resource: arn:aws:s3:::my-bucket/*
        managedPolicies:
          - arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
        permissionsBoundary: arn:aws:iam::123456789012:policy/MyBoundary
        tags:
          Team: AI
```

CloudFormation intrinsic functions are also supported for the `role` property:

```yaml
role:
  Fn::GetAtt:
    - MyCustomRole
    - Arn
```

## Commands

```bash
sls deploy                # Deploy to AWS
sls dev                   # Local development with hot reload
sls invoke --agent myAgent -d "Hello"  # Invoke a deployed agent
sls logs --agent myAgent  # Fetch agent logs
sls package               # Generate CloudFormation
sls remove                # Remove deployed resources
```

## Configuration Options

### Default Tags

Apply tags to all AgentCore resources:

```yaml
custom:
  agentCore:
    defaultTags:
      Project: MyProject
      Environment: ${self:provider.stage}
```

### VPC Configuration

For resources that support vpc mode:

```yaml
network:
  mode: vpc
  subnets:
    - subnet-12345678
    - subnet-87654321
  securityGroups:
    - sg-12345678
```

## CloudFormation Outputs

The plugin automatically creates CloudFormation outputs for each resource:

- `{Name}RuntimeArn` - Runtime ARN
- `{Name}RuntimeId` - Runtime ID
- `{Name}MemoryArn` - Memory ARN
- `{Name}MemoryId` - Memory ID
- `{Name}GatewayArn` - Gateway ARN
- `{Name}GatewayUrl` - Gateway URL
- `{Name}BrowserArn` - Browser ARN
- `{Name}BrowserId` - Browser ID
- `{Name}CodeInterpreterArn` - CodeInterpreter ARN
- `{Name}CodeInterpreterId` - CodeInterpreter ID

## Supported AWS Regions

AWS Bedrock AgentCore is available in select regions. Check AWS documentation for current availability.

## Examples

See the [examples directory](./examples/) for complete working examples:

**Python:**

- [langgraph-basic-docker](./examples/python/langgraph-basic-docker/) - Minimal LangGraph agent with Docker
- [langgraph-basic-code](./examples/python/langgraph-basic-code/) - LangGraph agent with code deployment
- [langgraph-gateway](./examples/python/langgraph-gateway/) - LangGraph agent with custom Lambda tools via Gateway
- [langgraph-multi-gateway](./examples/python/langgraph-multi-gateway/) - Multiple gateways with different authorization
- [langgraph-memory](./examples/python/langgraph-memory/) - LangGraph agent with conversation persistence
- [langgraph-browser](./examples/python/langgraph-browser/) - LangGraph agent with browser automation
- [langgraph-browser-custom](./examples/python/langgraph-browser-custom/) - Custom browser with session recording
- [langgraph-code-interpreter](./examples/python/langgraph-code-interpreter/) - LangGraph agent with code execution
- [langgraph-code-interpreter-custom](./examples/python/langgraph-code-interpreter-custom/) - Custom code interpreter with public network
- [strands-browser](./examples/python/strands-browser/) - Strands Agents with browser automation

**JavaScript:**

- [langgraph-basic](./examples/javascript/langgraph-basic/) - LangGraph JS agent (no Dockerfile)
- [langgraph-basic-dockerfile](./examples/javascript/langgraph-basic-dockerfile/) - Minimal LangGraph JS agent with Dockerfile
- [langgraph-browser](./examples/javascript/langgraph-browser/) - LangGraph JS agent with browser automation
- [langgraph-browser-custom](./examples/javascript/langgraph-browser-custom/) - Custom browser with session recording
- [langgraph-code-interpreter](./examples/javascript/langgraph-code-interpreter/) - LangGraph JS agent with code execution
- [langgraph-code-interpreter-custom](./examples/javascript/langgraph-code-interpreter-custom/) - Custom code interpreter with public network
- [langgraph-gateway](./examples/javascript/langgraph-gateway/) - LangGraph JS agent with Lambda tools via Gateway
- [langgraph-memory](./examples/javascript/langgraph-memory/) - LangGraph JS agent with conversation persistence
- [langgraph-multi-gateway](./examples/javascript/langgraph-multi-gateway/) - Multiple gateways with different authorization
- [mcp-server](./examples/javascript/mcp-server/) - JavaScript MCP server
- [strands-browser](./examples/javascript/strands-browser/) - Strands Agents JS with browser automation

## Related Resources

- [AWS Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-core.html)
- [Strands Agents SDK](https://github.com/strands-agents/sdk-python) - Python framework for building agents
