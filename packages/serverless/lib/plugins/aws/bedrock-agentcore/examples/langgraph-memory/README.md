# LangGraph Agent with Memory

A LangGraph agent demonstrating AgentCore Memory for conversation persistence using the tool-based approach.

## What This Example Shows

- **Memory as a Tool**: The LLM decides when to recall past context via `list_events` tool
- **Automatic Saving**: Conversations are saved via `create_event` after each response
- **BedrockAgentCoreApp**: Integration pattern for AgentCore Runtime
- **LangGraph**: Agent orchestration with tool calling
- **Claude Sonnet 4.5**: High-performance reasoning model

## Architecture

```
User Message
     ↓
AgentCore Runtime → LangGraph Agent
     ↓                    ↓
     ↓            [LLM decides to use tool?]
     ↓                    ↓
     ↓         YES: list_events → Memory → Context returned
     ↓                    ↓
     ↓            LLM generates response
     ↓                    ↓
     ↓            create_event → Memory (save turn)
     ↓
Response
```

## SDK Methods Used

| Method | Purpose |
|--------|---------|
| `MemoryClient.list_events()` | Retrieve recent conversation history |
| `MemoryClient.create_event()` | Save conversation turns |

## Prerequisites

- AWS account with Bedrock model access (Claude Sonnet 4.5)
- Enable access to US inference profile `us.anthropic.claude-sonnet-4-5-20250929-v1:0`
- Docker installed
- Serverless Framework v4+
- AWS credentials configured

## Quick Start

### 1. Deploy

```bash
serverless deploy
```

The framework will:
- Create AgentCore Memory resource
- Build the Docker image
- Push to Amazon ECR
- Deploy AgentCore Runtime with memory attached

### 2. Test Memory Persistence

Use the provided test script:

```bash
# Set the runtime ARN from deploy output
export RUNTIME_ARN=arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/xxx

# Run the test
python3 test-invoke.py
```

The test script will:
1. Tell the agent "My name is Alice"
2. Ask "What is my name?" (agent uses `list_events` tool to recall)
3. Verify the agent remembers "Alice"

### 3. Manual Testing

```python
import boto3
import json

client = boto3.client('bedrock-agentcore', region_name='us-east-1')

# Use the same session_id for memory persistence
session_id = "my-conversation-123"

# First message - agent saves to memory
response = client.invoke_agent_runtime(
    agentRuntimeArn='YOUR_RUNTIME_ARN',
    runtimeSessionId=session_id,
    payload=json.dumps({"prompt": "My favorite color is blue"}).encode()
)

# Later message - agent recalls using list_events tool
response = client.invoke_agent_runtime(
    agentRuntimeArn='YOUR_RUNTIME_ARN',
    runtimeSessionId=session_id,
    payload=json.dumps({"prompt": "What's my favorite color?"}).encode()
)
# Agent uses list_events tool, finds the context, responds: "Your favorite color is blue"
```

## How It Works

### Tool-Based Memory Access

Unlike approaches that always load history, this agent uses memory as a **tool**:

```python
@tool
def list_events():
    """Retrieve recent conversation history from memory."""
    events = memory_client.list_events(
        memory_id=MEMORY_ID,
        actor_id=actor_id,
        session_id=session_id,
        max_results=10
    )
    return formatted_history
```

The LLM **decides** when to call this tool based on:
- User asking about past conversations
- References to previous context
- Requests to "remember" or "recall"

### Automatic Conversation Saving

After each response, the conversation is saved:

```python
memory_client.create_event(
    memory_id=MEMORY_ID,
    actor_id=actor_id,
    session_id=session_id,
    messages=[
        (user_message, "USER"),
        (assistant_response, "ASSISTANT")
    ]
)
```

### Benefits of Tool-Based Approach

1. **Token Efficient**: Only loads history when the LLM determines it's needed
2. **Natural Conversation**: Agent reasons about when context is relevant
3. **Scalable**: Works with long conversation histories (selective retrieval)
4. **AWS Best Practice**: Matches the official AgentCore Memory design pattern

## Configuration

### Memory Expiration

```yaml
agents:
  chatbot:
    memory:
      expiration: 90  # 90 days (valid range: 3-365)
```

### Memory Strategies (Advanced)

Add strategies for long-term memory features:

```yaml
agents:
  chatbot:
    memory:
      expiration: 30
      strategies:
        - SemanticMemoryStrategy:
            Name: ConversationSearch
            Namespaces:
              - /conversations/{sessionId}
```

## Cleanup

```bash
serverless remove
```

## Next Steps

- [Add gateway tools](../langgraph-gateway/) - Expose Lambda functions as agent tools
- [Multiple gateways](../langgraph-multi-gateway/) - Different authorization for different tools
- [Memory Documentation](https://www.serverless.com/framework/docs/providers/aws/guide/agents/memory) - Full configuration reference
- [Basic Agent](../langgraph-basic-docker/) - LangGraph without memory
