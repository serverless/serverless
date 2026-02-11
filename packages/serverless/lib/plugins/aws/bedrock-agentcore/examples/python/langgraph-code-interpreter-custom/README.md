# LangGraph Custom Code Interpreter Example

This example demonstrates using a custom code interpreter with PUBLIC network mode, allowing code to access external APIs and internet resources.

## Features

- **Custom Code Interpreter**: Creates a `CodeInterpreterCustom` CloudFormation resource
- **PUBLIC Network Mode**: Code can access external APIs (unlike default SANDBOX mode)
- **Custom Tool Wrapper**: Uses `CodeInterpreter` directly with custom identifier
- **Network Validation**: Test script verifies PUBLIC mode by fetching external data

## Network Mode Comparison

| Mode                  | Network Access | Use Case                            |
| --------------------- | -------------- | ----------------------------------- |
| SANDBOX (default)     | None           | Maximum security, local computation |
| PUBLIC (this example) | Internet       | Fetch APIs, download data           |
| VPC                   | Private VPC    | Access internal resources           |

## Project Structure

```
langgraph-code-interpreter-custom/
├── serverless.yml     # Custom interpreter + agent configuration
├── agent.py           # LangGraph agent with custom interpreter
├── Dockerfile         # Container definition
├── pyproject.toml     # Python dependencies
├── test-invoke.py     # Validation script (tests PUBLIC mode)
└── README.md          # This file
```

## Prerequisites

- AWS account with Bedrock model access
- Docker installed
- Serverless Framework v4+
- Python 3.12+

## Deployment

1. **Deploy the agent:**

```bash
serverless deploy
```

2. **Note the runtime ARN** from the output:

```
ai:
  codeInterpreters: N/A
  agents:
    codeAgent: https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/.../invocations
```

## Testing

Run the validation script to verify PUBLIC network mode works:

```bash
export RUNTIME_ARN="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/..."
python test-invoke.py
```

The test asks the agent to fetch data from GitHub's public API. This would fail in SANDBOX mode but succeeds in PUBLIC mode.

## How It Works

### Custom Interpreter Configuration

```yaml
ai:
  codeInterpreters:
    publicInterpreter:
      description: Code interpreter with public internet access
      network:
        mode: PUBLIC # Enables external network access
```

### Agent Code

```python
from bedrock_agentcore.tools.code_interpreter_client import CodeInterpreter

# Get custom interpreter ID from environment
CUSTOM_INTERPRETER_ID = os.environ.get("CUSTOM_INTERPRETER_ID")

# Create client with custom identifier
code_interpreter = CodeInterpreter(region=AWS_REGION)
code_interpreter.start(identifier=CUSTOM_INTERPRETER_ID)  # Uses PUBLIC mode

# Execute code (can access external APIs)
response = code_interpreter.invoke(
    method="executeCode",
    params={"code": code, "language": "python"}
)

code_interpreter.stop()
```

### IAM Permissions

The agent's role needs permission to use the custom interpreter:

```yaml
role:
  statements:
    - Effect: Allow
      Action:
        - bedrock-agentcore:InvokeCodeInterpreter
      Resource: !GetAtt PublicInterpreterCodeInterpreter.CodeInterpreterArn
```

## Example Prompts

```python
# Fetch external API data (requires PUBLIC mode)
"Fetch the current Bitcoin price from a public API"

# Download and process data
"Download the iris dataset from scikit-learn and show summary statistics"

# Web scraping
"Fetch the HTML from example.com and count the number of paragraphs"
```

## Cleanup

Remove the deployed resources:

```bash
serverless remove
```

## Related Examples

- [langgraph-code-interpreter](../langgraph-code-interpreter/) - Basic example with default interpreter (SANDBOX)
