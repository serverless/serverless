<!--
title: Serverless Framework - AgentCore Code Interpreter Configuration
description: Add code execution capabilities to your AI agents using AgentCore Code Interpreter
short_title: Code Interpreter
keywords:
  [
    'Serverless Framework',
    'AWS Bedrock',
    'AgentCore',
    'Code Interpreter',
    'Python Execution',
    'JavaScript Execution',
    'TypeScript Execution',
    'Data Analysis',
    'LangGraph',
    'Strands',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/code-interpreter)

<!-- DOCS-SITE-LINK:END -->

# Code Interpreter Configuration

Code Interpreter enables your AI agents to execute Python, JavaScript, and TypeScript code in secure, isolated sandbox environments. Agents can perform calculations, analyze data, generate visualizations, and manipulate files through code execution.

## Quick Start

The simplest way to add code execution capabilities is using the AWS-managed default code interpreter with LangGraph:

**Configuration (`serverless.yml`):**

```yml
service: my-code-agent

provider:
  name: aws
  region: us-east-1

ai:
  agents:
    codeAgent: {} # Auto-detects Dockerfile
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

```text
bedrock-agentcore>=0.1.0
langchain>=0.3.0
langchain-aws>=0.2.0
langgraph>=0.2.0
```

The framework automatically handles code interpreter infrastructure - no additional configuration required.

## How It Works

When your agent uses the code interpreter:

1. **Agent Request**: Your agent calls a code execution tool with code to run
2. **AWS Infrastructure**: AgentCore manages sandbox environments in isolated microVMs
3. **Code Execution**: Code runs securely with persistent state within a session
4. **Response**: Results (text, files, visualizations) flow back to your agent

```text
Agent → Code Tool → AWS Sandbox → Results
```

## Capabilities

The code interpreter sandbox provides a full execution environment where your agent can:

- **Execute code** in Python, JavaScript, or TypeScript with persistent state across calls
- **Run shell commands** for system-level operations
- **Read, write, and manage files** in the sandbox filesystem
- **Install packages** to extend the environment (e.g., `pip install pandas`)
- **Run long-running tasks** asynchronously and check their status

## Using Code Interpreter in JavaScript

The `bedrock-agentcore` SDK provides `CodeInterpreter` for sandboxed code execution in JavaScript agents.

### Basic Pattern

```javascript
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { CodeInterpreter } from 'bedrock-agentcore/code-interpreter'
import { createAgent } from 'langchain'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const codeInterpreter = new CodeInterpreter({ region: 'us-east-1' })

// Define code execution tools wrapping CodeInterpreter methods
const executeCode = tool(
  async ({ code, language }) => {
    const result = await codeInterpreter.executeCode({
      code,
      language: language || 'python',
    })
    return result || 'Code executed successfully (no output)'
  },
  {
    name: 'execute_code',
    description:
      'Execute code in a secure sandbox. Supports Python, JavaScript, and TypeScript.',
    schema: z.object({
      code: z.string().describe('Code to execute'),
      language: z
        .enum(['python', 'javascript', 'typescript'])
        .optional()
        .describe('Programming language (default: python)'),
    }),
  },
)

const executeCommand = tool(
  async ({ command }) => {
    const result = await codeInterpreter.executeCommand({ command })
    return result || 'Command executed successfully (no output)'
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command in the sandbox.',
    schema: z.object({
      command: z.string().describe('Shell command to execute'),
    }),
  },
)

const readFiles = tool(
  async ({ paths }) => {
    const result = await codeInterpreter.readFiles({ paths })
    return result || 'No content'
  },
  {
    name: 'read_files',
    description: 'Read contents of files in the sandbox.',
    schema: z.object({
      paths: z.array(z.string()).describe('List of file paths to read'),
    }),
  },
)

// Create agent with code interpreter tools
const model = new ChatBedrockConverse({
  model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  region: 'us-east-1',
})

const agent = createAgent({
  model,
  tools: [executeCode, executeCommand, readFiles],
})

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({ prompt: z.string() }),
    async process(request) {
      try {
        const result = await agent.invoke({
          messages: [{ role: 'user', content: request.prompt }],
        })
        return { result: result.messages.at(-1).content }
      } finally {
        await codeInterpreter.stopSession()
      }
    },
  },
})

app.run()
```

**Dependencies (`package.json`):**

```json
{
  "dependencies": {
    "bedrock-agentcore": "^0.2.0",
    "@langchain/aws": "^1.2.5",
    "@langchain/core": "^1.1.28",
    "langchain": "^1.2.27",
    "zod": "^3.23.0"
  }
}
```

## Using Code Interpreter in Python

### LangGraph

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

### Strands Agents

Strands provides a streamlined integration through `AgentCoreCodeInterpreter`:

```python
from strands import Agent
from strands_tools.code_interpreter import AgentCoreCodeInterpreter

# Initialize code interpreter (uses AWS-managed default)
code_interpreter = AgentCoreCodeInterpreter(region="us-east-1")

# Create agent with code execution capability
agent = Agent(
    tools=[code_interpreter.code_interpreter],
    model="us.anthropic.claude-sonnet-4-20250514-v1:0",
    system_prompt="""You are a data analyst that can execute code.
Use the code interpreter to perform calculations, analyze data, and create visualizations."""
)

# Use the agent
result = agent("Create a bar chart of the top 10 programming languages by popularity")
```

**Dependencies (`requirements.txt`):**

```text
bedrock-agentcore>=0.1.0
strands-agents>=1.0.0
strands-agents-tools>=0.1.0
```

## Custom Code Interpreter Resources

For advanced scenarios, define custom code interpreter resources with specific configurations:

### When to Use Custom Code Interpreters

| Scenario                 | Recommendation                  |
| ------------------------ | ------------------------------- |
| Basic code execution     | Use AWS-managed default         |
| Need external API access | Define custom with PUBLIC mode  |
| Access VPC resources     | Define custom with VPC mode     |
| Maximum isolation        | Define custom with SANDBOX mode |

### Network Modes

Code Interpreter supports three network modes:

| Mode      | Description                                      | Use Case                            |
| --------- | ------------------------------------------------ | ----------------------------------- |
| `SANDBOX` | Completely isolated, no network access (default) | Maximum security, local computation |
| `PUBLIC`  | Can access external internet                     | Fetch APIs, download packages       |
| `VPC`     | Access to VPC resources                          | Connect to private databases        |

### Basic Custom Code Interpreter

```yml
ai:
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
ai:
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
ai:
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

Unlike memory and gateway, the framework does not automatically inject the code interpreter ID into your runtime agent. You must wire it manually using CloudFormation references in your `serverless.yml`:

```yml
ai:
  # Define the custom code interpreter
  codeInterpreters:
    publicInterpreter:
      description: Code interpreter with public internet access
      network:
        mode: PUBLIC

  # Runtime agent that uses the custom code interpreter
  agents:
    codeAgent:
      environment:
        # Pass the interpreter ID using CloudFormation !GetAtt
        CUSTOM_INTERPRETER_ID: !GetAtt PublicInterpreterCodeInterpreter.CodeInterpreterId
      role:
        statements:
          - Effect: Allow
            Action:
              - bedrock-agentcore:InvokeCodeInterpreter
              - bedrock-agentcore:CreateCodeInterpreter
              - bedrock-agentcore:StartCodeInterpreterSession
              - bedrock-agentcore:StopCodeInterpreterSession
              - bedrock-agentcore:DeleteCodeInterpreter
              - bedrock-agentcore:ListCodeInterpreters
              - bedrock-agentcore:GetCodeInterpreter
              - bedrock-agentcore:GetCodeInterpreterSession
              - bedrock-agentcore:ListCodeInterpreterSessions
            Resource: !GetAtt PublicInterpreterCodeInterpreter.CodeInterpreterArn
```

Then in your agent code, use the environment variable to connect to the custom interpreter:

**JavaScript:**

```javascript
import { CodeInterpreter } from 'bedrock-agentcore/code-interpreter'

const CUSTOM_INTERPRETER_ID = process.env.CUSTOM_INTERPRETER_ID

const codeInterpreter = new CodeInterpreter({
  region: 'us-east-1',
  identifier: CUSTOM_INTERPRETER_ID,
})

const result = await codeInterpreter.executeCode({
  code: "print('Hello from custom interpreter!')",
  language: 'python',
})

await codeInterpreter.stopSession()
```

**Python:**

```python
import os
from bedrock_agentcore.tools.code_interpreter_client import CodeInterpreter

CUSTOM_INTERPRETER_ID = os.environ.get("CUSTOM_INTERPRETER_ID")

code_interpreter = CodeInterpreter(region="us-east-1")
code_interpreter.start(identifier=CUSTOM_INTERPRETER_ID)

response = code_interpreter.invoke(
    method="executeCode",
    params={"code": "print('Hello from custom interpreter!')", "language": "python"}
)

code_interpreter.stop()
```

## Configuration Reference

### Code Interpreter Properties

| Property      | Type          | Required | Description                              |
| ------------- | ------------- | -------- | ---------------------------------------- |
| `network`     | object        | No       | Network configuration (default: SANDBOX) |
| `description` | string        | No       | Human-readable description               |
| `role`        | string/object | No       | IAM role ARN or configuration            |
| `tags`        | object        | No       | Resource tags                            |

### Network Configuration

| Property         | Type   | Required | Description                             |
| ---------------- | ------ | -------- | --------------------------------------- |
| `mode`           | string | Yes      | `SANDBOX` (default), `PUBLIC`, or `VPC` |
| `subnets`        | array  | VPC only | VPC subnet IDs                          |
| `securityGroups` | array  | VPC only | Security group IDs                      |

## IAM Role Configuration

The framework automatically creates IAM roles with necessary permissions. To customize:

```yml
ai:
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

**JavaScript:**

- [LangGraph Code Interpreter](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-code-interpreter) - Basic code execution with default interpreter
- [LangGraph Code Interpreter Custom](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-code-interpreter-custom) - Custom interpreter with PUBLIC network mode

**Python:**

- [LangGraph Code Interpreter](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-code-interpreter) - Basic code execution with default interpreter
- [LangGraph Code Interpreter Custom](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-code-interpreter-custom) - Custom interpreter with PUBLIC network mode

## Next Steps

- [Browser Configuration](./browser.md) - Web automation capabilities
- [Memory Configuration](./memory.md) - Conversation persistence
- [Gateway Configuration](./gateway.md) - Custom Lambda tools
- [Runtime Configuration](./runtime.md) - Deployment options
