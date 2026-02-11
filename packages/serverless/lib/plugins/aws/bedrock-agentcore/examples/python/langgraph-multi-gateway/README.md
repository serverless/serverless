# LangGraph Multi-Gateway Agent

Demonstrates multiple AgentCore Gateways with different authorization types and tool subsets.

## What This Example Shows

- **Multiple Gateways**: Creating separate gateways for different security levels
- **Authorization Types**: `NONE` (public) vs `AWS_IAM` (private) authorization
- **Tool Segmentation**: Assigning different tools to different gateways
- **Multiple Agents**: Each agent connected to its appropriate gateway

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              AgentCore Service              │
                    ├─────────────────────────────────────────────┤
┌──────────┐        │  ┌─────────────┐      ┌─────────────────┐   │
│  Public  │───────▶│  │Public Agent │─────▶│ Public Gateway  │   │
│  User    │        │  │             │      │  (auth: NONE)   │   │
└──────────┘        │  └─────────────┘      └────────┬────────┘   │
                    │                                │            │
                    │                       ┌────────▼────────┐   │
                    │                       │   Calculator    │   │
                    │                       │    Lambda       │   │
                    │                       └─────────────────┘   │
                    │                                             │
┌──────────┐        │  ┌──────────────┐     ┌─────────────────┐   │
│ Internal │───────▶│  │Private Agent │────▶│ Private Gateway │   │
│   User   │ (IAM)  │  │              │     │ (auth: AWS_IAM) │   │
└──────────┘        │  └──────────────┘     └────────┬────────┘   │
                    │                                │            │
                    │                       ┌────────▼────────┐   │
                    │                       │ Internal Lookup │   │
                    │                       │     Lambda      │   │
                    │                       └─────────────────┘   │
                    └─────────────────────────────────────────────┘
```

## When to Use Multiple Gateways

Use multiple gateways when you need:

1. **Different Authorization Levels**: Public tools vs internal tools
2. **Tool Segmentation**: Different agents need different tool subsets
3. **Security Boundaries**: Sensitive operations require authenticated access
4. **Compliance Requirements**: Separate access controls for different data types

## Prerequisites

- AWS account with Bedrock model access (Claude Sonnet 4.5)
- Enable access to US inference profile `us.anthropic.claude-sonnet-4-5-20250929-v1:0`
- Docker installed
- Serverless Framework v4+
- AWS credentials configured

## Quick Start

### 1. Deploy

```bash
serverless deploy
```

This deploys:

- Two Lambda functions (calculator, internal lookup)
- Two gateways (public, private)
- Two agents (public, private)

### 2. Test Public Agent

The public agent has access to the calculator tool:

```python
import boto3
import json
import uuid

client = boto3.client('bedrock-agentcore', region_name='us-east-1')

response = client.invoke_agent_runtime(
    agentRuntimeArn='YOUR_PUBLIC_AGENT_ARN',
    runtimeSessionId=str(uuid.uuid4()),
    payload=json.dumps({"prompt": "What is sqrt(144) + 10?"}).encode()
)

print(json.loads(response['response'].read()))
```

### 3. Test Private Agent

The private agent has access to the internal lookup tool:

```python
response = client.invoke_agent_runtime(
    agentRuntimeArn='YOUR_PRIVATE_AGENT_ARN',
    runtimeSessionId=str(uuid.uuid4()),
    payload=json.dumps({"prompt": "Look up user USR001 and tell me their department"}).encode()
)

print(json.loads(response['response'].read()))
```

## Configuration

### Gateway Authorization Types

| Type         | Use Case                     | Example                      |
| ------------ | ---------------------------- | ---------------------------- |
| `NONE`       | Public tools, no auth needed | Calculator, weather          |
| `AWS_IAM`    | Internal tools, requires IAM | User lookup, database access |
| `CUSTOM_JWT` | Third-party auth via JWT     | OAuth-protected APIs         |

### serverless.yml Structure

```yml
ai:
  tools:
    publicTool:
      function: publicFunction
      toolSchema: [...]

    privateTool:
      function: privateFunction
      toolSchema: [...]

  gateways:
    publicGateway:
      authorizer: NONE
      tools: [publicTool]

    privateGateway:
      authorizer: AWS_IAM
      tools: [privateTool]

  agents:
    publicAgent:
      gateway: publicGateway

    privateAgent:
      gateway: privateGateway
```

### JWT Authorization Example

For more sophisticated authentication:

```yml
ai:
  gateways:
    jwtGateway:
      authorizer:
        type: CUSTOM_JWT
        jwt:
          discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx/.well-known/openid-configuration
          allowedAudience:
            - my-client-id
          allowedScopes:
            - openid
      tools: [protectedTool]
```

## Files

| File                          | Purpose                               |
| ----------------------------- | ------------------------------------- |
| `serverless.yml`              | Infrastructure with multiple gateways |
| `public_agent.py`             | Agent using public gateway            |
| `private_agent.py`            | Agent using private gateway           |
| `handlers/calculator.py`      | Public calculator tool                |
| `handlers/internal_lookup.py` | Private user lookup tool              |
| `Dockerfile.public`           | Public agent container                |
| `Dockerfile.private`          | Private agent container               |
| `pyproject.toml`              | Python dependencies                   |

## Security Best Practices

1. **Use AWS_IAM for internal tools**: Ensures only authenticated AWS principals can invoke
2. **Segment tools by sensitivity**: Don't mix public and private tools in the same gateway
3. **Apply least privilege**: Each agent only gets access to the tools it needs
4. **Monitor access**: Use CloudWatch Logs to track gateway invocations

## Cleanup

```bash
serverless remove
```

## Next Steps

- [LangGraph Gateway](../langgraph-gateway/) - Basic single gateway example
- [LangGraph Memory](../langgraph-memory/) - Add conversation persistence
