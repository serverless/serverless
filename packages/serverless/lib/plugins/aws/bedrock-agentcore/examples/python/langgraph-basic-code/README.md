# LangGraph Basic Agent (Code Deployment)

A minimal LangGraph agent demonstrating core AgentCore concepts using code deployment.

> **Alternative**: See [langgraph-basic-docker](../langgraph-basic-docker/) for the same agent using Docker/container deployment.

## What This Example Shows

- **BedrockAgentCoreApp**: Integration pattern for AgentCore Runtime
- **LangGraph**: Agent orchestration with state management
- **Claude Sonnet 4.5**: High-performance reasoning model
- **Simple Tools**: Calculator and time tools
- **Code Deployment**: Python-based deployment (no Dockerfile needed)

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
- Serverless Framework v4+
- AWS credentials configured
- **No Docker required** (unlike container deployment)

> **Important**: This example uses the US cross-region inference profile for better availability and throughput. Direct model IDs may not support on-demand invocation.

## Quick Start

### 1. Deploy

```bash
# From this directory
serverless deploy
```

The framework will:

- Package Python code with dependencies
- Upload to Amazon S3
- Deploy AgentCore Runtime with managed Python runtime
- Output the invocation URL

### 2. Test

**Using the provided test script:**

```bash
# Update RUNTIME_ARN in test-invoke.py first
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

### Code Deployment

The configuration specifies:

- `handler: agent.py` - Entry point file (triggers code deployment mode)
- `package.patterns` - Files to include

Dependencies in `requirements.txt` are bundled automatically via `custom.pythonRequirements.dockerizePip: true`, which ensures dependencies are compiled for the target Linux runtime.

AgentCore automatically:

- Packages code with dependencies
- Uploads to S3
- Deploys to managed Python runtime

## Code vs Docker Deployment

| Aspect        | Code (this example)       | Docker                        |
| ------------- | ------------------------- | ----------------------------- |
| Configuration | `handler: agent.py`       | `chatbot: {}`                 |
| Dependencies  | `requirements.txt`        | `pyproject.toml` + Dockerfile |
| Build         | Automatic packaging to S3 | Docker image to ECR           |
| Runtime       | AWS managed Python        | Custom container              |
| Languages     | Python only               | Any language                  |
| Setup         | No Dockerfile needed      | Dockerfile required           |

## Configuration

### Model Selection

The model is hardcoded in `agent.py`. To change:

```python
llm = init_chat_model(
    "us.anthropic.claude-3-5-sonnet-20241022-v2:0",  # Different model
    model_provider="bedrock_converse",
)
```

Or use an environment variable:

```yml
agents:
  chatbot:
    handler: agent.py
    environment:
      MODEL_ID: us.anthropic.claude-sonnet-4-5-20250929-v1:0
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
tools = [get_current_time, add, multiply, search_database]
```

### Optional: Configure Runtime

Add optional runtime configuration:

```yml
agents:
  chatbot:
    handler: agent.py
    environment:
      CUSTOM_VAR: value
    lifecycle:
      idleRuntimeSessionTimeout: 900 # Idle timeout (60-28800 seconds)
      maxLifetime: 3600 # Max lifetime (60-28800 seconds)
```

## Cleanup

Remove all resources:

```bash
serverless remove
```

## Next Steps

- [Add gateway tools](../langgraph-gateway/) - Expose Lambda functions as agent tools
- [Add memory](../langgraph-memory/) - Enable conversation persistence
