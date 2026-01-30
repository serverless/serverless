# LangGraph Basic Agent (Docker Deployment)

A minimal LangGraph agent demonstrating core AgentCore concepts using Docker/container deployment.

> **Alternative**: See [langgraph-basic-code](../langgraph-basic-code/) for the same agent using code deployment.

## What This Example Shows

- **BedrockAgentCoreApp**: Integration pattern for AgentCore Runtime
- **LangGraph**: Agent orchestration with state management
- **Claude Sonnet 4.5**: High-performance reasoning model
- **Simple Tools**: Calculator and time tools
- **Docker Deployment**: Containerized agent deployment (any language)

## Architecture

```
User Request → AgentCore Runtime → agent_invocation()
                                      ↓
                                   LangGraph
                                      ↓
                               Claude Sonnet 4.5
                                      ↓
                          (uses built-in tools)
                                      ↓
                                   Response
```

## Prerequisites

- AWS account with Bedrock model access (Claude Sonnet 4.5)
- Enable access to US inference profile `us.anthropic.claude-sonnet-4-5-20250929-v1:0` in Bedrock console
- Docker installed
- Serverless Framework v4+
- AWS credentials configured

> **Important**: This example uses the US cross-region inference profile for better availability and throughput. Direct model IDs may not support on-demand invocation.

## Quick Start

### 1. Deploy

```bash
# From this directory
serverless deploy
```

The framework will:
- Build the Docker image
- Push to Amazon ECR
- Deploy AgentCore Runtime
- Output the invocation URL

### 2. Test

**Using the provided test script:**

```bash
python3 test-invoke.py
```

**Or invoke programmatically with boto3:**

```python
import boto3
import json
import uuid

client = boto3.client('bedrock-agentcore', region_name='us-east-1')

response = client.invoke_agent_runtime(
    agentRuntimeArn='YOUR_RUNTIME_ARN',  # From deploy output
    runtimeSessionId=str(uuid.uuid4()),
    payload=json.dumps({"prompt": "What is 25 multiplied by 4?"}).encode()
)

# Parse response
result = json.loads(response['response'].read())
print(result)
```

> **Important**: You cannot invoke AgentCore runtimes directly via curl. You must use the AWS SDK with the `bedrock-agentcore` client and the `invoke_agent_runtime` API method.

### 3. Local Development

Test locally before deploying:

```bash
serverless dev
```

This runs your agent in a local Docker container, allowing you to test changes quickly without deploying to AWS.

## How It Works

### The Agent Code

`agent.py` implements a simple LangGraph agent:

1. **Initialize LLM**: Uses Claude Sonnet 4.5 via Bedrock Converse API
2. **Define Tools**: Adds calculator and time tools using `@tool` decorator
3. **Build Graph**: Creates a state machine with chatbot and tool nodes
4. **Entrypoint**: `@app.entrypoint` decorator marks the invocation function
5. **Process Messages**: Handles requests and returns responses

### The LangGraph

```
START → chatbot → [decide: use tool or respond]
           ↑            ↓
           └─── tools ←┘
```

- **chatbot node**: Invokes Claude with tool availability
- **tools node**: Executes tools if requested
- **conditional edge**: Decides whether to use tools based on LLM response

### Docker Deployment

The Dockerfile:
- Uses Python 3.12 slim base image
- Installs dependencies from `pyproject.toml`
- Runs the agent with `python agent.py`

AgentCore automatically:
- Builds the image
- Pushes to ECR
- Updates the Runtime with the new image

## Configuration

### Model Selection

Change the model in `serverless.yml`:

```yml
agents:
  chatbot:
    environment:
      MODEL_ID: anthropic.claude-3-5-sonnet-20241022-v2:0  # or another Bedrock model
```

### Add More Tools

Add tools in `agent.py` using the `@tool` decorator:

```python
from langchain_core.tools import tool

@tool
def search_database(query: str) -> str:
    """Search the product database."""
    # Your database logic here
    return f"Found products matching: {query}"

# Add to tools list
tools = [get_current_time, calculate, search_database]
```

### Optional: Configure Runtime

The minimal configuration auto-detects Dockerfile:

```yml
agents:
  chatbot: {}  # Empty braces required by YAML
```

Add optional runtime configuration as needed:

```yml
agents:
  chatbot:
    environment:
      CUSTOM_VAR: value
    lifecycle:
      idleRuntimeSessionTimeout: 900  # Idle timeout (60-28800 seconds)
      maxLifetime: 3600  # Max lifetime (60-28800 seconds)
    network:
      mode: VPC  # VPC deployment
      subnets: [subnet-xxx]
      securityGroups: [sg-xxx]
```

## Cleanup

Remove all resources:

```bash
serverless remove
```

## Next Steps

- [Add gateway tools](../langgraph-gateway/) - Expose Lambda functions as agent tools
- [Add memory](../langgraph-memory/) - Enable conversation persistence
