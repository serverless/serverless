<!--
title: Serverless Framework - AgentCore Code Interpreter Configuration
description: Add Python code execution capabilities to your AI agents using AgentCore Code Interpreter
short_title: Code Interpreter
keywords:
  [
    'Serverless Framework',
    'AWS Bedrock',
    'AgentCore',
    'Code Interpreter',
    'Python Execution',
    'Data Analysis',
    'LangGraph',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/code-interpreter)

<!-- DOCS-SITE-LINK:END -->

# Code Interpreter Configuration

Code Interpreter enables your AI agents to execute Python code in secure, isolated sandbox environments. Agents can perform calculations, analyze data, generate visualizations, and manipulate files through code execution.

## Quick Start

The simplest way to add code execution capabilities is using the AWS-managed default code interpreter with LangGraph:

**Configuration (`serverless.yml`):**

```yml
service: my-code-agent

provider:
  name: aws
  region: us-east-1

agents:
  codeAgent: {}  # Auto-detects Dockerfile
```

**Agent code (`agent.py`):**

```python
import asyncio
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from langchain.chat_models import init_chat_model
from langchain_aws.tools import create_code_interpreter_toolkit
from langgraph.prebuilt import create_react_agent

app = BedrockAgentCoreApp()

@app.entrypoint
async def invoke(payload, context):
    # Create code interpreter toolkit (uses AWS-managed default)
    toolkit, code_tools = await create_code_interpreter_toolkit(region="us-east-1")

    # Initialize chat model
    llm = init_chat_model(
        "us.anthropic.claude-sonnet-4-20250514-v1:0",
        model_provider="bedrock_converse",
    )

    # Create agent with code interpreter tools
    agent = create_react_agent(model=llm, tools=code_tools)

    # Run the agent
    config = {"configurable": {"thread_id": "session-1"}}
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": payload.get("prompt")}]},
        config=config
    )

    await toolkit.cleanup()
    return {"result": result["messages"][-1].content}

app.run()
```

**Dependencies (`requirements.txt`):**

```
bedrock-agentcore>=0.1.0
langchain>=0.3.0
langchain-aws>=0.2.0
langgraph>=0.2.0
```

The framework automatically handles code interpreter infrastructure - no additional configuration required.

## How It Works

When your agent uses the code interpreter:

1. **Agent Request**: Your agent calls a code execution tool with Python code
2. **AWS Infrastructure**: AgentCore manages sandbox environments in isolated microVMs
3. **Code Execution**: Python code runs securely with persistent state within a session
4. **Response**: Results (text, files, visualizations) flow back to your agent

```
Agent → LangGraph → CodeInterpreter → AWS Sandbox → Results
```

## Available Tools

The code interpreter toolkit provides these tools:

| Tool | Description |
|------|-------------|
| `execute_code` | Run Python/JavaScript/TypeScript code with persistent state |
| `execute_command` | Run shell commands in the environment |
| `read_files` | Read content of files in the environment |
| `write_files` | Create or update files |
| `list_files` | List files in directories |
| `delete_files` | Remove files from the environment |
| `upload_file` | Upload files with semantic descriptions |
| `install_packages` | Install Python packages |
| `start_command_execution` | Start long-running commands asynchronously |
| `get_task` | Check status of an async task |
| `stop_task` | Stop a running async task |

## Using Code Interpreter with LangGraph

### Basic Pattern

```python
from langchain_aws.tools import create_code_interpreter_toolkit
from langgraph.prebuilt import create_react_agent

# Create toolkit (uses AWS-managed default)
toolkit, code_tools = await create_code_interpreter_toolkit(region="us-east-1")

# Create agent with code interpreter tools
agent = create_react_agent(model=llm, tools=code_tools)

# Use the agent
config = {"configurable": {"thread_id": "session-123"}}
result = await agent.ainvoke(
    {"messages": [{"role": "user", "content": "Calculate the 50th Fibonacci number"}]},
    config=config
)

# Clean up when done
await toolkit.cleanup()
```

### Data Analysis Example

```python
agent = create_react_agent(
    model=llm,
    tools=code_tools,
)

# Analyze data
result = await agent.ainvoke(
    {"messages": [{"role": "user", "content": """
    Create a dataset of 100 random sales records with columns:
    date, product, quantity, price.
    Then calculate total revenue by product and create a bar chart.
    """}]},
    config=config
)
```

### Combining with Browser Tool

```python
from langchain_aws.tools import create_code_interpreter_toolkit, create_browser_toolkit

# Create both toolkits
code_toolkit, code_tools = await create_code_interpreter_toolkit(region="us-east-1")
browser_toolkit, browser_tools = await create_browser_toolkit(region="us-east-1")

# Create agent with both capabilities
agent = create_react_agent(
    model=llm,
    tools=code_tools + browser_tools,
)
```

## Custom Code Interpreter Resources

For advanced scenarios, define custom code interpreter resources with specific configurations:

### When to Use Custom Code Interpreters

| Scenario | Recommendation |
|----------|----------------|
| Basic code execution | Use AWS-managed default |
| Need external API access | Define custom with PUBLIC mode |
| Access VPC resources | Define custom with VPC mode |
| Maximum isolation | Define custom with SANDBOX mode |

### Network Modes

Code Interpreter supports three network modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| `SANDBOX` | Completely isolated, no network access (default) | Maximum security, local computation |
| `PUBLIC` | Can access external internet | Fetch APIs, download packages |
| `VPC` | Access to VPC resources | Connect to private databases |

### Basic Custom Code Interpreter

```yml
agents:
  codeInterpreters:
    analyzer:
      description: Python execution environment
      network:
        mode: SANDBOX
      tags:
        Purpose: DataAnalysis
```

### Code Interpreter with Public Network

Enable external API access for your code:

```yml
agents:
  codeInterpreters:
    publicAnalyzer:
      description: Code interpreter with internet access
      network:
        mode: PUBLIC
      tags:
        Purpose: ExternalAPIs
```

### Code Interpreter with VPC Access

Access private resources through VPC:

```yml
agents:
  codeInterpreters:
    vpcAnalyzer:
      description: Code interpreter for internal resources
      network:
        mode: VPC
        subnets:
          - subnet-12345678
          - subnet-87654321
        securityGroups:
          - sg-12345678
```

### Using Custom Code Interpreter in Agent Code

When using a custom code interpreter, pass its identifier to the client:

```python
from bedrock_agentcore.tools.code_interpreter_client import CodeInterpreter

# Get custom interpreter ID from environment
CUSTOM_INTERPRETER_ID = os.environ.get("CUSTOM_INTERPRETER_ID")

# Create client with custom identifier
code_interpreter = CodeInterpreter(region="us-east-1")
code_interpreter.start(identifier=CUSTOM_INTERPRETER_ID)

# Execute code
response = code_interpreter.invoke(
    method="executeCode",
    params={"code": "print('Hello from custom interpreter!')", "language": "python"}
)

# Clean up
code_interpreter.stop()
```

## Configuration Reference

### Code Interpreter Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `network` | object | Yes | Network configuration |
| `description` | string | No | Human-readable description |
| `role` | string/object | No | IAM role ARN or configuration |
| `tags` | object | No | Resource tags |

### Network Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `mode` | string | Yes | `SANDBOX` (default), `PUBLIC`, or `VPC` |
| `subnets` | array | VPC only | VPC subnet IDs |
| `securityGroups` | array | VPC only | Security group IDs |

## IAM Role Configuration

The framework automatically creates IAM roles with necessary permissions. To customize:

```yml
agents:
  codeInterpreters:
    customInterpreter:
      network:
        mode: PUBLIC
      role:
        name: custom-interpreter-role
        statements:
          - Effect: Allow
            Action:
              - s3:GetObject
              - s3:PutObject
            Resource: arn:aws:s3:::my-data-bucket/*
        tags:
          Team: AI
```

## Session Management

Code interpreter sessions maintain state across tool calls:

- **Variables persist**: Defined variables remain available
- **Imports persist**: Imported libraries stay loaded
- **Files persist**: Created files remain accessible
- **Session isolation**: Different `thread_id` values create separate sessions

```python
# Session 1: Define variable
result1 = await agent.ainvoke(
    {"messages": [{"role": "user", "content": "Set x = 100"}]},
    config={"configurable": {"thread_id": "user-1"}}
)

# Session 1: Variable still available
result2 = await agent.ainvoke(
    {"messages": [{"role": "user", "content": "What is x * 2?"}]},
    config={"configurable": {"thread_id": "user-1"}}
)
# Returns 200

# Session 2: Different session, x not defined
result3 = await agent.ainvoke(
    {"messages": [{"role": "user", "content": "What is x?"}]},
    config={"configurable": {"thread_id": "user-2"}}
)
# Error: x is not defined
```

## Examples

- [LangGraph Code Interpreter](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-code-interpreter) - Basic code execution with default interpreter
- [LangGraph Code Interpreter Custom](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/langgraph-code-interpreter-custom) - Custom interpreter with PUBLIC network mode

## Next Steps

- [Browser Configuration](./browser.md) - Web automation capabilities
- [Memory Configuration](./memory.md) - Conversation persistence
- [Gateway Configuration](./gateway.md) - Custom Lambda tools
- [Runtime Configuration](./runtime.md) - Deployment options
