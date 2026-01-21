# Strands Agent with Automatic Code Packaging

This example demonstrates deploying a Strands AI agent to AWS Bedrock AgentCore using **automatic code packaging** - no Docker or manual S3 uploads required!

## Features

- **No Docker Required**: Framework automatically packages and uploads code
- **Automatic ARM64 Packaging**: Python dependencies are built for ARM64 (AgentCore's architecture)
- **Same as Lambda**: Uses familiar `package.patterns` for include/exclude
- **Custom Tools**: Time, calculator, and weather tools
- **Strands Integration**: Uses `strands-agents` with Amazon Nova Micro model

## How It Works

```
serverless deploy
       ↓
1. Package Python code + dependencies (ARM64)
2. Create ZIP artifact
3. Upload to deployment bucket
4. Deploy CloudFormation with S3 reference
       ↓
AgentCore Runtime created
```

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Python 3.12+ installed
3. Node.js 18+ installed

## Project Structure

```
strands-auto-package/
├── serverless.yml      # Service configuration
├── handler.py          # Agent code with @app.entrypoint
├── requirements.txt    # Python dependencies
└── README.md          # This file
```

## Configuration

### serverless.yml

Minimal configuration for automatic code deployment:

```yaml
custom:
  pythonRequirements: true  # Enable Python packaging

agents:
  codeAgent:
    type: runtime
    artifact:
      entryPoint:
        - handler.py
      # runtime defaults to PYTHON_3_13
```

### handler.py

Must use `BedrockAgentCoreApp` with `@app.entrypoint`:

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()

@app.entrypoint
def invoke(payload, context):
    return {"result": "response"}

if __name__ == "__main__":
    app.run()
```

## Deployment

```bash
# Deploy
serverless deploy

# Or with specific stage/region
serverless deploy --stage prod --region us-west-2
```

## Testing

After deployment, invoke the agent:

```bash
# Get runtime ARN from stack outputs
RUNTIME_ARN=$(aws cloudformation describe-stacks \
  --stack-name strands-auto-agent-dev \
  --query 'Stacks[0].Outputs[?contains(OutputKey, `RuntimeArn`)].OutputValue' \
  --output text)

# Create session ID
SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

# Invoke
PAYLOAD=$(echo -n '{"prompt": "What time is it?"}' | base64)
aws bedrock-agentcore invoke-agent-runtime \
  --agent-runtime-arn "$RUNTIME_ARN" \
  --content-type "application/json" \
  --runtime-session-id "$SESSION_ID" \
  --payload "$PAYLOAD" \
  response.json

cat response.json
```

## Package Customization

Use `package.patterns` to customize what gets included:

```yaml
agents:
  codeAgent:
    type: runtime
    artifact:
      entryPoint: [handler.py]
    package:
      patterns:
        - '!tests/**'      # Exclude tests
        - '!*.md'          # Exclude markdown
        - '!.git/**'       # Exclude git
        - 'src/**'         # Include src directory
```

## Comparison: Auto-Package vs Manual S3

| Feature | Auto-Package | Manual S3 |
|---------|--------------|-----------|
| Setup | Just `entryPoint` | Create bucket, build, upload |
| Dependencies | Automatic (ARM64) | Manual pip install |
| Build | Automatic | Manual script |
| Upload | Automatic | Manual S3 cp |
| Best for | Most use cases | Full control |

## Comparison: Code vs Docker Deployment

| Feature | Code Deployment | Docker Deployment |
|---------|-----------------|-------------------|
| Setup | Minimal | Requires Dockerfile |
| Dependencies | pip install (ARM64) | Full control |
| Build time | Fast | Slower |
| Package size | Smaller | Larger |
| Customization | Limited to Python | Full OS control |
| Best for | Simple agents | Complex dependencies |

## Common Issues

### 1. Missing ARM64 Wheel

**Error**: `Could not find a version that satisfies the requirement`

Some packages don't have ARM64 wheels. Options:
- Use Docker deployment instead
- Find an alternative package with ARM64 support

### 2. Package Too Large

AgentCore has size limits. Reduce package size:
```yaml
package:
  patterns:
    - '!tests/**'
    - '!docs/**'
    - '!*.md'
```

### 3. Entry Point Not Found

**Error**: Runtime fails to start

Ensure handler.py:
1. Uses `BedrockAgentCoreApp` with `@app.entrypoint`
2. Calls `app.run()` at the end
3. Is in the root of the package

## Cleanup

```bash
serverless remove
```
