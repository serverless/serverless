# Bedrock AgentCore Plugin

Deploy AWS Bedrock AgentCore resources with Serverless Framework.

## Features

- Define AgentCore resources in `serverless.yml` using the `agents` top-level property
- Supports all AgentCore resource types:
  - **Runtime** - Deploy containerized AI agents
  - **Memory** - Conversation history with semantic search
  - **Gateway** - External API integrations (MCP protocol)
  - **Browser** - Web browsing capabilities
  - **CodeInterpreter** - Sandboxed code execution
  - **WorkloadIdentity** - OAuth2 authentication
- Auto-generates IAM roles with least-privilege permissions
- Automatic tagging and naming conventions
- CloudFormation outputs for cross-stack references

## Quick Start

```yaml
service: my-agent

provider:
  name: aws
  region: us-east-1

agents:
  myAgent:
    type: runtime
    description: My AI agent
    artifact:
      docker:
        path: .
        file: Dockerfile
        repository: my-agent
    protocol: HTTP
    network:
      networkMode: PUBLIC
    # Omit 'authorizer' for IAM authentication (default)
```

## Resource Types

### Runtime

Deploy containerized AI agents with the AgentCore Runtime.

```yaml
agents:
  myAgent:
    type: runtime
    description: My AI agent
    artifact:
      docker:
        path: .
        file: Dockerfile
        repository: my-agent
    protocol: HTTP # HTTP, MCP, or A2A
    network:
      networkMode: PUBLIC # PUBLIC or VPC
    # Optional: JWT authorization (omit for IAM auth)
    authorizer:
      jwt:
        discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx/.well-known/openid-configuration
        allowedAudience:
          - my-client-id
    # Optional: Pass specific headers to the runtime
    requestHeaders:
      allowlist:
        - X-User-Id
        - X-Session-Id
        - Authorization
    # Optional: Lifecycle configuration
    lifecycle:
      idleRuntimeSessionTimeout: 900 # 60-28800 seconds
      maxLifetime: 28800 # 60-28800 seconds
```

#### S3 Code Deployment (Alternative to Docker)

For Python agents, you can deploy code directly from S3 without Docker:

```yaml
agents:
  myAgent:
    type: runtime
    artifact:
      s3:
        bucket: my-bucket
        key: agent.zip
      runtime: PYTHON_3_12 # PYTHON_3_10, PYTHON_3_11, PYTHON_3_12, PYTHON_3_13
      entryPoint:
        - main.py
        - handler
```

| Property                                         | Required | Description                                   |
| ------------------------------------------------ | -------- | --------------------------------------------- |
| `type`                                           | Yes      | `runtime`                                     |
| `artifact.docker.path`                           | Yes\*    | Docker build context path                     |
| `artifact.docker.file`                           | No       | Dockerfile name (default: Dockerfile)         |
| `artifact.docker.repository`                     | No       | ECR repository name                           |
| `artifact.containerImage`                        | Yes\*    | Pre-built container image URI                 |
| `artifact.s3.bucket`                             | Yes\*    | S3 bucket for code artifact                   |
| `artifact.s3.key`                                | Yes\*    | S3 key for code artifact                      |
| `artifact.runtime`                               | No       | Python runtime (default: PYTHON_3_12)         |
| `artifact.entryPoint`                            | No       | Entry point array (default: main.py, handler) |
| `protocol`                                       | No       | `HTTP`, `MCP`, or `A2A`                       |
| `network.networkMode`                            | No       | `PUBLIC` or `VPC`                             |
| `authorizer.customJwtAuthorizer`                 | No       | JWT authorizer config (omit for IAM auth)     |
| `authorizer.customJwtAuthorizer.discoveryUrl`    | Yes\*\*  | OIDC discovery URL                            |
| `authorizer.customJwtAuthorizer.allowedAudience` | No       | Array of allowed audience values              |
| `authorizer.customJwtAuthorizer.allowedClients`  | No       | Array of allowed client IDs                   |
| `lifecycle.idleRuntimeSessionTimeout`            | No       | Session idle timeout (60-28800s)              |
| `lifecycle.maxLifetime`                          | No       | Max session lifetime (60-28800s)              |
| `requestHeaders.allowlist`                       | No       | Headers to pass to runtime (max 20)           |
| `description`                                    | No       | Runtime description                           |
| `roleArn`                                        | No       | Custom IAM role ARN                           |

\*One of `artifact.docker`, `artifact.containerImage`, or `artifact.s3` is required

\*\*Required when using `customJwtAuthorizer`

### Memory

Store conversation history with semantic search and summarization.

```yaml
agents:
  conversationMemory:
    type: memory
    description: Conversation memory with semantic search
    eventExpiryDuration: 90
    strategies:
      # Semantic search strategy
      - SemanticMemoryStrategy:
          Name: ConversationSearch
          Namespaces:
            - /conversations/{sessionId}

      # Summarization strategy
      - SummaryMemoryStrategy:
          Name: SessionSummary
          Namespaces:
            - /sessions/{sessionId}

      # User preference strategy
      - UserPreferenceMemoryStrategy:
          Name: UserPrefs
          Namespaces:
            - /users/{userId}/preferences
```

| Property              | Required | Description                         |
| --------------------- | -------- | ----------------------------------- |
| `type`                | Yes      | `memory`                            |
| `eventExpiryDuration` | No       | Days to retain (3-365, default: 30) |
| `strategies`          | No       | Memory strategies array             |
| `description`         | No       | Memory description                  |
| `encryptionKeyArn`    | No       | KMS key for encryption              |
| `roleArn`             | No       | Custom IAM role ARN                 |

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

### Browser

Enable web browsing capabilities for agents.

```yaml
agents:
  webBrowser:
    type: browser
    description: Web browser for agent
    network:
      networkMode: PUBLIC # PUBLIC or VPC
    signing:
      enabled: true
    recording:
      enabled: true
      s3Location:
        bucket: my-recordings-bucket
        prefix: browser-sessions/
```

| Property               | Required | Description                               |
| ---------------------- | -------- | ----------------------------------------- |
| `type`                 | Yes      | `browser`                                 |
| `network.networkMode`  | No       | `PUBLIC` or `VPC` (default: `PUBLIC`)     |
| `network.vpcConfig`    | No       | VPC configuration (required for VPC mode) |
| `signing.enabled`      | No       | Enable request signing                    |
| `recording.enabled`    | No       | Enable session recording                  |
| `recording.s3Location` | No       | S3 bucket/prefix for recordings           |
| `description`          | No       | Browser description                       |
| `roleArn`              | No       | Custom IAM role ARN                       |

### CodeInterpreter

Enable sandboxed code execution.

```yaml
agents:
  codeExecutor:
    type: codeInterpreter
    description: Python code execution
    network:
      networkMode: SANDBOX # SANDBOX, PUBLIC, or VPC
```

| Property              | Required | Description                                        |
| --------------------- | -------- | -------------------------------------------------- |
| `type`                | Yes      | `codeInterpreter`                                  |
| `network.networkMode` | No       | `SANDBOX`, `PUBLIC`, or `VPC` (default: `SANDBOX`) |
| `network.vpcConfig`   | No       | VPC configuration (required for VPC mode)          |
| `description`         | No       | CodeInterpreter description                        |
| `roleArn`             | No       | Custom IAM role ARN                                |

### WorkloadIdentity

Enable OAuth2 authentication for agents to access external services.

```yaml
agents:
  agentIdentity:
    type: workloadIdentity
    oauth2ReturnUrls:
      - https://example.com/callback
      - http://localhost:3000/auth/callback
```

| Property           | Required | Description                  |
| ------------------ | -------- | ---------------------------- |
| `type`             | Yes      | `workloadIdentity`           |
| `oauth2ReturnUrls` | No       | Allowed OAuth2 redirect URLs |

### Gateway

Integrate external APIs as agent tools via MCP protocol.

```yaml
agents:
  # Gateway without authentication
  publicGateway:
    type: gateway
    description: Public API gateway
    authorizerType: NONE
    targets:
      - name: WeatherAPI
        type: lambda
        description: Get weather data
        functionArn:
          Fn::GetAtt:
            - WeatherFunction
            - Arn

  # Gateway with JWT authentication
  secureGateway:
    type: gateway
    description: Secure API gateway with JWT auth
    authorizerType: CUSTOM_JWT
    authorizerConfiguration:
      customJwtAuthorizer:
        discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx/.well-known/openid-configuration
        allowedAudience:
          - my-client-id
        allowedClients:
          - my-app-client
        allowedScopes:
          - read
          - write
    protocolConfiguration:
      mcp:
        supportedVersions:
          - '2024-11-05'
        instructions: 'Use these tools for external API access'
        searchType: SEMANTIC
    targets:
      - name: SecureAPI
        type: lambda
        functionArn:
          Fn::GetAtt:
            - SecureFunction
            - Arn
```

| Property                                                      | Required | Description                                                        |
| ------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `type`                                                        | Yes      | `gateway`                                                          |
| `authorizerType`                                              | No       | `NONE`, `AWS_IAM`, or `CUSTOM_JWT` (default: `AWS_IAM`)            |
| `authorizerConfiguration.customJwtAuthorizer`                 | No\*     | JWT authorizer config (required when `authorizerType: CUSTOM_JWT`) |
| `authorizerConfiguration.customJwtAuthorizer.discoveryUrl`    | Yes\*\*  | OIDC discovery URL                                                 |
| `authorizerConfiguration.customJwtAuthorizer.allowedAudience` | No       | Array of allowed audience values                                   |
| `authorizerConfiguration.customJwtAuthorizer.allowedClients`  | No       | Array of allowed client IDs                                        |
| `authorizerConfiguration.customJwtAuthorizer.allowedScopes`   | No       | Array of allowed OAuth scopes                                      |
| `protocolConfiguration.mcp`                                   | No       | MCP protocol configuration                                         |
| `protocolType`                                                | No       | `MCP` (default: `MCP`)                                             |
| `targets`                                                     | No       | Gateway targets (Lambda functions)                                 |
| `description`                                                 | No       | Gateway description                                                |
| `roleArn`                                                     | No       | Custom IAM role ARN                                                |
| `kmsKeyArn`                                                   | No       | KMS key for encryption                                             |

\*Required when `authorizerType` is `CUSTOM_JWT`

\*\*Required when using `customJwtAuthorizer`

#### Gateway Targets

Lambda function targets for the gateway:

```yaml
targets:
  - name: MyTool
    type: lambda
    description: Description shown to agents
    functionArn: arn:aws:lambda:us-east-1:123456789012:function:MyFunction
    credentialProvider:
      oauthCredentialProvider:
        providerArn: arn:aws:secretsmanager:us-east-1:123456789012:secret:oauth-creds
        scopes:
          - read
          - write
```

## Commands

```bash
sls agentcore info        # Show defined resources
sls agentcore build       # Build Docker images
sls agentcore invoke      # Invoke a deployed agent
sls agentcore logs        # Fetch logs for a runtime
sls package               # Generate CloudFormation
sls deploy                # Deploy to AWS
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

For resources that support VPC mode:

```yaml
network:
  networkMode: VPC
  vpcConfig:
    subnets:
      - subnet-12345678
      - subnet-87654321
    securityGroups:
      - sg-12345678
```

### Custom IAM Roles

Bring your own IAM roles instead of auto-generated ones:

```yaml
agents:
  myAgent:
    type: runtime
    roleArn: arn:aws:iam::123456789012:role/MyCustomRole
    # ... other config
```

## CloudFormation Outputs

The plugin automatically creates CloudFormation outputs for each resource:

- `{AgentName}RuntimeArn` - Runtime ARN
- `{AgentName}RuntimeId` - Runtime ID
- `{AgentName}MemoryArn` - Memory ARN
- `{AgentName}MemoryId` - Memory ID
- `{AgentName}GatewayArn` - Gateway ARN
- `{AgentName}GatewayUrl` - Gateway URL
- `{AgentName}BrowserArn` - Browser ARN
- `{AgentName}CodeInterpreterArn` - CodeInterpreter ARN
- `{AgentName}WorkloadIdentityArn` - WorkloadIdentity ARN

## Supported AWS Regions

AWS Bedrock AgentCore is available in select regions. Check AWS documentation for current availability.

## Examples

See the [examples directory](./examples/) for complete working examples:

- [langgraph-basic-docker](./examples/langgraph-basic-docker/) - Minimal LangGraph agent with Docker
- [langgraph-basic-code](./examples/langgraph-basic-code/) - LangGraph agent with code deployment
- [langgraph-gateway](./examples/langgraph-gateway/) - LangGraph agent with custom Lambda tools via Gateway
- [langgraph-multi-gateway](./examples/langgraph-multi-gateway/) - Multiple gateways with different authorization
- [langgraph-memory](./examples/langgraph-memory/) - LangGraph agent with conversation persistence
- [langgraph-browser](./examples/langgraph-browser/) - LangGraph agent with browser automation
- [langgraph-browser-custom](./examples/langgraph-browser-custom/) - Custom browser with session recording
- [langgraph-code-interpreter](./examples/langgraph-code-interpreter/) - LangGraph agent with code execution
- [langgraph-code-interpreter-custom](./examples/langgraph-code-interpreter-custom/) - Custom code interpreter with PUBLIC network
- [strands-browser](./examples/strands-browser/) - Strands Agents with browser automation

## Related Resources

- [AWS Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-core.html)
- [Strands Agents SDK](https://github.com/strands-agents/sdk-python) - Python framework for building agents
- [Google ADK](https://github.com/google/adk-python) - Alternative agent framework
