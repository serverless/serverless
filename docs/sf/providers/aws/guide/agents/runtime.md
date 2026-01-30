  <!--
title: Serverless Framework - AgentCore Runtime Configuration
description: Configure AgentCore Runtime agents with deployment options, networking, authentication, and lifecycle management
short_title: Runtime
keywords:
  [
    'Serverless Framework',
    'AWS Bedrock',
    'AgentCore',
    'Runtime',
    'Docker',
    'VPC',
    'JWT',
    'Authentication',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/runtime)

<!-- DOCS-SITE-LINK:END -->

# Runtime Configuration

A Runtime is your deployed agent application. It's the container or Python code that runs your AI agent logic (LangGraph, Strands, or custom implementations). The Serverless Framework handles building, packaging, and deploying your runtime to AWS Bedrock AgentCore.

For a quick start guide, see the main [AI Agents](./README.md) page.

## Deployment Methods

AgentCore supports two deployment methods: Docker/Image deployment (any language) and Code deployment (Python only).

### Docker/Image Deployment

Use Docker for multi-language projects, complex dependencies, or full control over the runtime environment.

**Minimal configuration (auto-detection):**

```yml
agents:
  myAgent: {}
```

The framework automatically detects a `Dockerfile` in the current directory and handles:
- Building the Docker image
- Creating an ECR repository
- Pushing the image to ECR
- Deploying to AgentCore

**Explicit Dockerfile configuration:**

```yml
agents:
  myAgent:
    artifact:
      image:
        file: Dockerfile.agent    # Custom Dockerfile name
        path: ./agent             # Build context directory
        repository: my-agent-repo # Custom ECR repository name
        buildArgs:                # Docker build arguments
          PYTHON_VERSION: "3.12"
          ENV: production
```

**Pre-built image:**

```yml
agents:
  myAgent:
    artifact:
      image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest
```

Use pre-built images when:
- You have an existing CI/CD pipeline for building images
- You want to share images across services
- You need to use images from other AWS accounts

### Code Deployment (Python Only)

Deploy Python code directly without Docker. Best for simple agents with standard dependencies.

**Basic code deployment:**

```yml
agents:
  myAgent:
    handler: agent.py
    runtime: PYTHON_3_12
```

The `handler` property triggers code deployment mode. The framework packages your Python code and uploads it to S3.

**Supported runtimes:**
- `PYTHON_3_10`
- `PYTHON_3_11`
- `PYTHON_3_12`
- `PYTHON_3_13` (default)

**With custom S3 location:**

```yml
agents:
  myAgent:
    handler: main.py
    runtime: PYTHON_3_12
    artifact:
      s3:
        bucket: my-artifacts-bucket
        key: agents/my-agent.zip
        versionId: abc123  # Optional: specific version
```

Use custom S3 locations when:
- You have pre-packaged agent code
- You want to manage artifacts separately from deployments
- You need version pinning for production

## Network Configuration

Control how your runtime connects to the network.

### PUBLIC Mode (Default)

Your agent is accessible over the internet with AWS authentication.

```yml
agents:
  myAgent:
    network:
      mode: PUBLIC
```

**Use PUBLIC mode when:**
- Your agent needs to call external APIs
- You want simpler networking setup
- You're building public-facing agents

### VPC Mode

Deploy your agent within a Virtual Private Cloud for enhanced security.

```yml
agents:
  myAgent:
    network:
      mode: VPC
      subnets:
        - subnet-0123456789abcdef0
        - subnet-0123456789abcdef1
      securityGroups:
        - sg-0123456789abcdef0
```

**Use VPC mode when:**
- Your agent needs to access private resources (databases, internal APIs)
- You have compliance requirements for network isolation
- You want to control egress traffic

**VPC requirements:**
- Subnets must have NAT Gateway access for external calls
- Security groups must allow outbound HTTPS (443) for AWS services
- Consider using VPC endpoints for AWS services to reduce costs

## Authentication

Control who can invoke your runtime.

### Default (AWS IAM)

Without an authorizer, your runtime uses AWS SigV4 authentication. Callers must have valid AWS credentials and IAM permissions.

```yml
agents:
  myAgent: {}  # Uses AWS IAM by default
```

### JWT Authentication

Protect your runtime with JWT tokens from an OIDC-compliant identity provider (Cognito, Auth0, Okta, etc.).

```yml
agents:
  myAgent:
    authorizer:
      type: CUSTOM_JWT
      jwt:
        discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxxxx/.well-known/openid-configuration
        allowedAudience:
          - my-app-client-id
        allowedClients:
          - my-app-client-id
        allowedScopes:
          - openid
          - profile
```

**JWT configuration options:**

| Property | Required | Description |
|----------|----------|-------------|
| `discoveryUrl` | Yes | OIDC discovery endpoint URL |
| `allowedAudience` | No | List of valid `aud` claim values |
| `allowedClients` | No | List of valid `client_id` values |
| `allowedScopes` | No | List of required scopes |
| `customClaims` | No | Custom claim validation rules |

**Custom claims validation:**

```yml
agents:
  myAgent:
    authorizer:
      type: CUSTOM_JWT
      jwt:
        discoveryUrl: https://.../.well-known/openid-configuration
        customClaims:
          - inboundTokenClaimName: department
            inboundTokenClaimValueType: STRING
            authorizingClaimMatchValue:
              claimMatchOperator: EQUALS
              claimMatchValue:
                matchValueString: engineering
```

For a complete example with Cognito, see the [runtime-jwt-auth example](https://github.com/serverless/serverless/blob/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/runtime-jwt-auth.yml).

## Lifecycle Configuration

Control session timeouts and runtime lifetime.

```yml
agents:
  myAgent:
    lifecycle:
      idleRuntimeSessionTimeout: 900  # seconds (60-28800)
      maxLifetime: 3600               # seconds (60-28800)
```

| Property | Range | Default | Description |
|----------|-------|---------|-------------|
| `idleRuntimeSessionTimeout` | 60-28800 | 900 | Seconds before idle session is terminated |
| `maxLifetime` | 60-28800 | 28800 | Maximum session lifetime regardless of activity |

**When to adjust these values:**

- **Lower `idleRuntimeSessionTimeout`**: For cost savings when agents have sporadic usage
- **Higher `idleRuntimeSessionTimeout`**: For agents with long-running conversations
- **Lower `maxLifetime`**: For security-sensitive applications requiring session rotation
- **Higher `maxLifetime`**: For long-running batch processing or analysis tasks

## Protocol Configuration

Specify the communication protocol for your runtime.

```yml
agents:
  myAgent:
    protocol: HTTP  # HTTP, MCP, or A2A
```

| Protocol | Description | Use Case |
|----------|-------------|----------|
| `HTTP` | Standard HTTP requests (default) | General purpose agents, REST-like interactions |
| `MCP` | Model Context Protocol | Agents that expose tools via MCP |
| `A2A` | Agent-to-Agent | Multi-agent orchestration |

## Environment Variables

Pass configuration to your runtime via environment variables.

```yml
agents:
  myAgent:
    environment:
      MODEL_ID: us.anthropic.claude-sonnet-4-5-20250929-v1:0
      LOG_LEVEL: INFO
      MAX_TOKENS: "4096"
      API_ENDPOINT: https://api.example.com
```

**Best practices:**

- Use [inference profile IDs](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html) (e.g., `us.anthropic.claude-...`) for on-demand Bedrock models
- Store secrets in AWS Secrets Manager or Parameter Store, not in environment variables
- Limit: 50 environment variables maximum

## Request Headers

Control which HTTP headers are passed through to your runtime.

```yml
agents:
  myAgent:
    requestHeaders:
      allowlist:
        - X-Trace-Id
        - X-Request-Id
        - X-Correlation-Id
```

**Use cases:**
- Distributed tracing (pass trace IDs)
- Custom authentication (pass additional tokens)
- Request correlation across services

**Limits:** Maximum 20 headers in the allowlist.

## IAM Role Configuration

The framework automatically creates an IAM role with required permissions. You can customize or replace it.

### Auto-generated Role (Default)

```yml
agents:
  myAgent: {}  # Role created automatically
```

The auto-generated role includes permissions for:
- CloudWatch Logs (create log groups, write logs)
- ECR (pull container images)
- Bedrock (invoke models, if referenced)
- Memory, Gateway, Browser, CodeInterpreter (if referenced)

### Custom Role ARN

Use an existing IAM role:

```yml
agents:
  myAgent:
    role: arn:aws:iam::123456789012:role/MyCustomAgentRole
```

### Role Customization

Add custom permissions to the auto-generated role:

```yml
agents:
  myAgent:
    role:
      name: my-agent-role  # Optional: custom role name
      statements:
        - Effect: Allow
          Action:
            - s3:GetObject
            - s3:PutObject
          Resource: arn:aws:s3:::my-bucket/*
        - Effect: Allow
          Action: secretsmanager:GetSecretValue
          Resource: arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-*
      managedPolicies:
        - arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess
      permissionsBoundary: arn:aws:iam::123456789012:policy/MyPermissionsBoundary
      tags:
        CostCenter: AI-Team
```

| Property | Description |
|----------|-------------|
| `name` | Custom role name (max 64 chars) |
| `statements` | Additional IAM policy statements |
| `managedPolicies` | ARNs of managed policies to attach |
| `permissionsBoundary` | ARN of permissions boundary policy |
| `tags` | Tags to apply to the role |

## Tags and Description

Add metadata to your runtime for organization and cost tracking.

```yml
agents:
  myAgent:
    description: Production customer service agent with memory and tools
    tags:
      Team: AI
      Project: CustomerService
      Environment: production
      CostCenter: CC-1234
```

| Property | Limit | Description |
|----------|-------|-------------|
| `description` | 1200 chars | Human-readable description |
| `tags` | Standard AWS limits | Key-value pairs for resource tagging |

## Complete Configuration Reference

Here's a complete example showing all configuration options:

```yml
service: my-ai-service

provider:
  name: aws
  region: us-east-1

agents:
  myAgent:
    # Description
    description: Production AI agent with full configuration

    # Deployment (choose one approach)
    artifact:
      image:
        file: Dockerfile
        path: ./agent
        repository: my-agent-repo
        buildArgs:
          ENV: production

    # OR for code deployment:
    # handler: agent.py
    # runtime: PYTHON_3_12

    # Protocol
    protocol: HTTP

    # Networking
    network:
      mode: PUBLIC
      # For VPC:
      # mode: VPC
      # subnets: [subnet-xxx]
      # securityGroups: [sg-xxx]

    # Authentication
    authorizer:
      type: CUSTOM_JWT
      jwt:
        discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx/.well-known/openid-configuration
        allowedAudience:
          - my-client-id
        allowedClients:
          - my-client-id

    # Lifecycle
    lifecycle:
      idleRuntimeSessionTimeout: 900
      maxLifetime: 3600

    # Environment
    environment:
      MODEL_ID: us.anthropic.claude-sonnet-4-5-20250929-v1:0
      LOG_LEVEL: INFO

    # Headers
    requestHeaders:
      allowlist:
        - X-Trace-Id

    # IAM Role
    role:
      statements:
        - Effect: Allow
          Action: s3:GetObject
          Resource: arn:aws:s3:::my-bucket/*

    # Metadata
    tags:
      Team: AI
      Environment: production
```

## Examples

- [LangGraph Docker](https://github.com/serverless/serverless/blob/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-basic-docker/) - LangGraph with Docker deployment
- [LangGraph Code](https://github.com/serverless/serverless/blob/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-basic-code/) - LangGraph with code deployment
- [LangGraph Memory](https://github.com/serverless/serverless/blob/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-memory/) - LangGraph with conversation persistence

## Next Steps

- [Gateway Configuration](./gateway.md) - Add custom tools to your agent
- [Memory Configuration](./memory.md) - Enable conversation persistence
- [Browser Tool](./browser.md) - Web automation capabilities
- [Code Interpreter](./code-interpreter.md) - Python code execution
