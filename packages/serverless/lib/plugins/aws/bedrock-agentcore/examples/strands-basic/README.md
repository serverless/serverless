# Strands Basic Agent Example

A complete, runnable example of a Strands AI agent deployed to AWS Bedrock AgentCore.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Docker installed (for building the agent container)
- Serverless Framework installed

## Project Structure

```
strands-basic/
├── serverless.yml    # Serverless Framework configuration
├── agent.py          # Strands agent implementation
├── Dockerfile        # Container build instructions
├── pyproject.toml    # Python dependencies
└── .dockerignore     # Docker build exclusions
```

## Deploy

```bash
# Deploy to AWS
sls deploy

# Deploy to a specific stage
sls deploy --stage prod
```

## Invoke

After deployment, invoke the agent:

```bash
# Using the CLI command
sls agentcore invoke --message "What time is it?"

# Or with a specific agent name
sls agentcore invoke --agent strandsAgent --message "Calculate 25 * 4"
```

## View Logs

```bash
# View recent logs
sls agentcore logs

# Stream logs in real-time
sls agentcore logs --tail
```

## How It Works

### The Agent (`agent.py`)

The agent is built using the [Strands Agents SDK](https://github.com/strands-agents/sdk-python):

1. **Tools**: Custom functions decorated with `@tool` that the agent can call
2. **Agent**: Configured with a Bedrock model and system prompt
3. **Entrypoint**: The `@app.entrypoint` function handles incoming requests

### The Dockerfile

- Uses `uv` for fast Python package installation
- Based on Python 3.12 slim image
- Runs as non-root user for security
- Exposes port 8080 (AgentCore default)

### CloudFormation Resources

The plugin generates:
- `AWS::BedrockAgentCore::Runtime` - The agent runtime
- `AWS::IAM::Role` - Execution role with Bedrock permissions
- `AWS::ECR::Repository` - Container registry (if needed)

## Customization

### Add More Tools

```python
@tool
def search_database(query: str) -> str:
    """Search the database for information."""
    # Your implementation
    return results
```

### Change the Model

```python
agent = Agent(
    model="us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    # ...
)
```

### Add Memory

See the `memory-strategies.yml` example for adding conversation memory.

## Remove

```bash
sls remove
```

## Related Examples

- `memory-strategies.yml` - Memory configuration options
- `runtime-jwt-auth.yml` - JWT authentication with Cognito
- `full-stack-agent.yml` - All resource types combined
