# LangGraph Code Interpreter Example

This example demonstrates using AWS-managed default code interpreter with a LangGraph agent for Python code execution.

## Features

- **Default Code Interpreter**: Uses AWS-managed interpreter (SANDBOX mode)
- **LangGraph Integration**: Uses `create_code_interpreter_toolkit()` from langchain-aws
- **Full Tool Suite**: Access to execute_code, file operations, package installation
- **Session Isolation**: Each thread_id maintains separate state

## Project Structure

```
langgraph-code-interpreter/
├── serverless.yml     # Serverless Framework configuration
├── agent.py           # LangGraph agent with code interpreter
├── Dockerfile         # Container definition
├── pyproject.toml     # Python dependencies
├── test-invoke.py     # Validation script
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
  agents:
    codeAgent: https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/.../invocations
```

## Testing

Run the validation script to verify code execution works:

```bash
export RUNTIME_ARN="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/..."
python test-invoke.py
```

The test asks the agent to calculate the 50th Fibonacci number (12586269025), which requires actual code execution.

## How It Works

### Agent Code

```python
from langchain_aws.tools import create_code_interpreter_toolkit
from langgraph.prebuilt import create_react_agent

# Create toolkit (uses AWS-managed default)
toolkit, code_tools = await create_code_interpreter_toolkit(region="us-east-1")

# Create agent with code interpreter tools
agent = create_react_agent(model=llm, tools=code_tools)

# Run the agent
result = await agent.ainvoke(
    {"messages": [{"role": "user", "content": prompt}]},
    config={"configurable": {"thread_id": session_id}}
)

# Clean up
await toolkit.cleanup()
```

### Available Tools

The toolkit provides these tools:

| Tool               | Description             |
| ------------------ | ----------------------- |
| `execute_code`     | Run Python/JS/TS code   |
| `execute_command`  | Run shell commands      |
| `read_files`       | Read file contents      |
| `write_files`      | Create/update files     |
| `list_files`       | List directory contents |
| `delete_files`     | Remove files            |
| `upload_file`      | Upload with description |
| `install_packages` | Install Python packages |

## Example Prompts

```python
# Data analysis
"Create a dataset of 100 random sales records and calculate average by product"

# Calculations
"Calculate the 50th Fibonacci number"

# File operations
"Create a Python script that reads a CSV and generates a summary report"

# Visualization
"Generate a bar chart showing monthly sales trends"
```

## Cleanup

Remove the deployed resources:

```bash
serverless remove
```

## Related Examples

- [langgraph-code-interpreter-custom](../langgraph-code-interpreter-custom/) - Custom interpreter with PUBLIC network mode
