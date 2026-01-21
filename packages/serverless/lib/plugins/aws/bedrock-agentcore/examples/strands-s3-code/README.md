# Strands Agent with S3 Code Deployment (Manual)

This example demonstrates deploying a Strands AI agent to AWS Bedrock AgentCore using **manual S3 code deployment** - you manage the S3 bucket and artifact upload yourself.

## Features

- **No Docker Required**: Just Python code uploaded to S3
- **Full Control**: You manage the S3 bucket and artifacts
- **Custom Tools**: Time, calculator, and weather tools
- **Strands Integration**: Uses `strands-agents` with Amazon Nova Micro model

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Python 3.12+ installed
3. Node.js 18+ installed
4. S3 bucket for artifacts

## Project Structure

```
strands-s3-code/
├── serverless.yml      # Service configuration
├── handler.py          # Agent code with @app.entrypoint
├── requirements.txt    # Python dependencies
└── README.md          # This file
```

## Step 1: Create S3 Bucket

```bash
# Create bucket for artifacts
aws s3 mb s3://strands-s3-agent-artifacts-dev --region us-east-1
```

## Step 2: Package the Agent

AgentCore requires ARM64-compatible binaries. Package with platform-specific flags:

```bash
# Create package directory
rm -rf package && mkdir package

# Install dependencies for ARM64
pip install -r requirements.txt \
  --target ./package \
  --platform manylinux2014_aarch64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all:

# Copy handler
cp handler.py package/

# Remove Python cache files (required!)
find package -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find package -type f -name "*.pyc" -delete 2>/dev/null || true

# Create ZIP
cd package && zip -r ../agent.zip . && cd ..
```

## Step 3: Upload to S3

```bash
aws s3 cp agent.zip s3://strands-s3-agent-artifacts-dev/agent.zip
```

## Step 4: Deploy

```bash
serverless deploy
```

## Testing

After deployment, invoke the agent:

```bash
# Get runtime ARN from stack outputs
RUNTIME_ARN=$(aws cloudformation describe-stacks \
  --stack-name strands-s3-agent-dev \
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

## Handler Requirements

The handler must use `BedrockAgentCoreApp` with `@app.entrypoint`:

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()

@app.entrypoint
def invoke(payload, context):
    return {"result": "response"}

if __name__ == "__main__":
    app.run()
```

## Common Issues

### 1. Architecture Incompatibility

**Error**: `Your artifact contains binary files that are incompatible with Linux ARM64`

**Fix**: Rebuild with ARM64 platform flags:
```bash
pip install -r requirements.txt \
  --platform manylinux2014_aarch64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all: \
  --target ./package
```

### 2. Python Cache Files

**Error**: `Your artifact contains Python cache files`

**Fix**: Remove cache files before zipping:
```bash
find package -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find package -type f -name "*.pyc" -delete 2>/dev/null || true
```

### 3. Entry Point Validation

**Error**: `Invalid entrypoint value`

**Fix**: Ensure:
- `entryPoint` is a single-element array with just the file path: `["handler.py"]`
- The file uses `@app.entrypoint` decorator

## Cleanup

```bash
# Remove the stack
serverless remove

# Optionally remove the S3 bucket
aws s3 rb s3://strands-s3-agent-artifacts-dev --force
```

## Alternative: Auto-Packaging

For automatic packaging without manual S3 management, see the `strands-auto-package` example.
