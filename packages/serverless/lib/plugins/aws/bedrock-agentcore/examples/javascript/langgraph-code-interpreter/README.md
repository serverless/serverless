# LangGraph Code Interpreter Example

A LangGraph JavaScript agent with AWS-managed code interpreter for sandboxed code execution.

## Features

- **Sandboxed Execution**: Run Python, JavaScript, or TypeScript in a SANDBOX environment
- **File Operations**: Read, write, and list files in the sandbox
- **Shell Commands**: Execute shell commands
- **LangGraph JS**: ReAct agent pattern with code execution tools

## Tools Available

| Tool | Description |
|------|-------------|
| `execute_code` | Execute Python/JS/TS code in sandbox |
| `execute_command` | Run shell commands |
| `read_files` | Read file contents |
| `write_files` | Write files |
| `list_files` | List directory contents |

## Quick Start

### Deploy

```bash
npm install
sls deploy
```

### Test

```bash
RUNTIME_ARN=<your-runtime-arn> node test-invoke.js
```

### Remove

```bash
sls remove
```

## Related Examples

- [langgraph-code-interpreter-custom](../langgraph-code-interpreter-custom/) - Custom interpreter with PUBLIC network
