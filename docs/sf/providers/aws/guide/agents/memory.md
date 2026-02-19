<!--
title: Serverless Framework - AgentCore Memory Configuration
description: Configure AgentCore Memory for conversation persistence, context management, and memory strategies
short_title: Memory
keywords:
  [
    'Serverless Framework',
    'AWS Bedrock',
    'AgentCore',
    'Memory',
    'Conversation Persistence',
    'Context Management',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/memory)

<!-- DOCS-SITE-LINK:END -->

# Memory Configuration

Memory enables your AI agents to persist conversation history and context across invocations. AgentCore Memory stores conversation data in AWS-managed infrastructure, allowing agents to recall previous interactions and maintain context over time.

## Quick Start

Add memory to any agent with a single property:

```yml
ai:
  agents:
    myAgent:
      memory:
        expiration: 30 # Days until memory events expire (3-365)
```

The framework automatically:

- Creates the AgentCore Memory resource
- Injects `BEDROCK_AGENTCORE_MEMORY_ID` environment variable into your runtime
- Grants necessary IAM permissions

## How Memory Works

Memory persists conversation data tied to a **session ID**. When your agent receives a request, the session ID determines which conversation history to load.

```text
Request 1 (session: abc-123)
  User: "My name is Alice"
  Agent: "Nice to meet you, Alice!"
  → Stored in memory

Request 2 (session: abc-123)
  User: "What's my name?"
  Agent: "Your name is Alice"  ← Retrieved from memory

Request 3 (session: xyz-789)  # Different session
  User: "What's my name?"
  Agent: "I don't know your name yet"  ← No history for this session
```

## Configuration Patterns

### Inline Memory (Single Agent)

Define memory directly on an agent. Best for simple, single-agent deployments:

```yml
ai:
  agents:
    myAgent:
      memory:
        expiration: 30 # 30 days
```

### Shared Memory (Multiple Agents)

Define memory at the `ai.memory` level and reference by name. Best when multiple agents need access to the same conversation history:

```yml
ai:
  memory:
    conversations:
      expiration: 90 # 90 days
      description: Shared conversation memory

  agents:
    chatbot:
      memory: conversations # Reference by name

    assistant:
      memory: conversations # Same memory, different agent
```

## Memory Strategies

Strategies define how memory processes and retrieves conversation data. They're optional—memory works without them—but strategies enable advanced features like semantic search and summarization.

### SemanticMemoryStrategy

Enables similarity-based search across conversation history. Use when agents need to find relevant past conversations.

```yml
ai:
  memory:
    searchable:
      expiration: 90 # 90 days
      strategies:
        - SemanticMemoryStrategy:
            Name: ConversationSearch
            Description: Semantic search over conversation history
            Namespaces:
              - /conversations/{sessionId}
              - /users/{userId}/chats
```

### SummaryMemoryStrategy

Maintains condensed conversation context. Use for long conversations where full history exceeds token limits.

```yml
ai:
  memory:
    summarized:
      expiration: 90 # 90 days
      strategies:
        - SummaryMemoryStrategy:
            Name: ConversationSummary
            Description: Summarizes long conversations
            Namespaces:
              - /sessions/{sessionId}
```

### UserPreferenceMemoryStrategy

Tracks user preferences across sessions. Use for personalization that persists beyond individual conversations.

```yml
ai:
  memory:
    preferences:
      expiration: 365 # Maximum retention (1 year)
      strategies:
        - UserPreferenceMemoryStrategy:
            Name: UserSettings
            Description: Tracks user preferences and settings
            Namespaces:
              - /users/{userId}/preferences
```

### EpisodicMemoryStrategy

Stores episodic memories with reflection capabilities. Use for agents that need to learn from past experiences.

```yml
ai:
  memory:
    episodes:
      expiration: 30 # 30 days
      strategies:
        - EpisodicMemoryStrategy:
            Name: Episodes
            Description: Stores episodic memories with reflection
            Namespaces:
              - /episodes/{sessionId}
```

### CustomMemoryStrategy

Application-specific memory handling with custom configuration.

```yml
ai:
  memory:
    custom:
      expiration: 30 # 30 days
      strategies:
        - CustomMemoryStrategy:
            Name: ApplicationSpecific
            Description: Custom memory handling
            Configuration:
              customField: customValue
              processingMode: batch
```

### Multi-Strategy Memory

Combine multiple strategies for comprehensive memory management:

```yml
ai:
  memory:
    comprehensive:
      expiration: 90 # 90 days
      strategies:
        # Semantic search for finding relevant conversations
        - SemanticMemoryStrategy:
            Name: SemanticSearch
            Namespaces:
              - /conversations/{sessionId}

        # Summarization for context management
        - SummaryMemoryStrategy:
            Name: ContextSummary
            Namespaces:
              - /sessions/{sessionId}

        # User preferences for personalization
        - UserPreferenceMemoryStrategy:
            Name: Preferences
            Namespaces:
              - /users/{userId}
```

## Environment Variable Injection

When memory is configured, the framework automatically injects the `BEDROCK_AGENTCORE_MEMORY_ID` environment variable into your runtime. Use this to initialize memory clients in your agent code.

**Python (Strands):**

```python
import os
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager

MEMORY_ID = os.environ.get("BEDROCK_AGENTCORE_MEMORY_ID")

config = AgentCoreMemoryConfig(
    memory_id=MEMORY_ID,
    session_id=session_id,  # From request context
    actor_id="user"
)
session_manager = AgentCoreMemorySessionManager(
    agentcore_memory_config=config,
    region_name="us-east-1"
)
```

**Python (LangGraph / General):**

```python
import os
from bedrock_agentcore.memory import MemoryClient

MEMORY_ID = os.environ.get("BEDROCK_AGENTCORE_MEMORY_ID")
memory_client = MemoryClient(region_name="us-east-1")

# Save conversation turn
memory_client.create_event(
    memory_id=MEMORY_ID,
    actor_id="user-123",
    session_id="session-456",
    messages=[
        ("What's the weather?", "USER"),
        ("Today is sunny!", "ASSISTANT")
    ]
)

# Retrieve conversation history
events = memory_client.list_events(
    memory_id=MEMORY_ID,
    actor_id="user-123",
    session_id="session-456",
    max_results=10
)
```

**JavaScript:**

```javascript
import {
  BedrockAgentCoreClient,
  CreateEventCommand,
  ListEventsCommand,
} from '@aws-sdk/client-bedrock-agentcore'

const MEMORY_ID = process.env.BEDROCK_AGENTCORE_MEMORY_ID
const client = new BedrockAgentCoreClient()

// Save conversation turn
await client.send(
  new CreateEventCommand({
    memoryId: MEMORY_ID,
    actorId: 'user-123',
    sessionId: 'session-456',
    eventTimestamp: new Date(),
    payload: [
      {
        conversational: {
          content: { text: "What's the weather?" },
          role: 'USER',
        },
      },
      {
        conversational: {
          content: { text: 'Today is sunny!' },
          role: 'ASSISTANT',
        },
      },
    ],
  }),
)

// Retrieve conversation history
const { events } = await client.send(
  new ListEventsCommand({
    memoryId: MEMORY_ID,
    actorId: 'user-123',
    sessionId: 'session-456',
    maxResults: 10,
  }),
)
```

## IAM Role Configuration

The framework automatically creates an IAM role for each memory resource. This role includes the AWS managed policy `AmazonBedrockAgentCoreMemoryBedrockModelInferenceExecutionRolePolicy`, which grants Bedrock model invocation permissions required for memory strategies (extraction, consolidation). You can add custom statements alongside this managed policy:

```yml
ai:
  memory:
    conversations:
      expiration: 30 # 30 days
      role:
        name: custom-memory-role
        statements:
          - Effect: Allow
            Action:
              - kms:Decrypt
            Resource: arn:aws:kms:us-east-1:123456789012:key/xxx
        tags:
          Team: AI
```

## Configuration Reference

### Memory Properties

| Property        | Type          | Required | Description                                          |
| --------------- | ------------- | -------- | ---------------------------------------------------- |
| `expiration`    | number        | No       | Days until memory events expire (3-365, default: 30) |
| `description`   | string        | No       | Human-readable description                           |
| `encryptionKey` | string        | No       | KMS key ARN for encryption                           |
| `strategies`    | array         | No       | Memory processing strategies                         |
| `role`          | string/object | No       | IAM role ARN or configuration                        |
| `tags`          | object        | No       | Resource tags                                        |

### Strategy Properties

Each strategy type has specific properties:

| Strategy                       | Required Properties | Optional Properties                                    |
| ------------------------------ | ------------------- | ------------------------------------------------------ |
| `SemanticMemoryStrategy`       | `Name`              | `Description`, `Namespaces`                            |
| `SummaryMemoryStrategy`        | `Name`              | `Description`, `Namespaces`                            |
| `UserPreferenceMemoryStrategy` | `Name`              | `Description`, `Namespaces`                            |
| `EpisodicMemoryStrategy`       | `Name`              | `Description`, `Namespaces`, `ReflectionConfiguration` |
| `CustomMemoryStrategy`         | `Name`              | `Description`, `Namespaces`, `Configuration`           |

## Complete Example

```yml
service: my-ai-service

provider:
  name: aws
  region: us-east-1

ai:
  # Shared memory with multiple strategies
  memory:
    conversationMemory:
      description: Production conversation memory
      expiration: 90 # 90 days
      strategies:
        - SemanticMemoryStrategy:
            Name: ConversationSearch
            Namespaces:
              - /conversations/{sessionId}
        - SummaryMemoryStrategy:
            Name: ContextSummary
            Namespaces:
              - /sessions/{sessionId}
      tags:
        Environment: production

  # Agent with shared memory reference
  agents:
    chatbot:
      memory: conversationMemory # Reference shared memory
```

## Examples

**JavaScript:**

- [LangGraph with Memory](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/javascript/langgraph-memory) - LangGraph agent with conversation persistence

**Python:**

- [LangGraph with Memory](https://github.com/serverless/serverless/tree/main/packages/serverless/lib/plugins/aws/bedrock-agentcore/examples/python/langgraph-memory) - LangGraph agent with conversation persistence

## Next Steps

- [Runtime Configuration](./runtime.md) - Deployment, networking, authentication
- [Gateway Configuration](./gateway.md) - Add custom tools to your agents
- [Browser Tool](./browser.md) - Web automation capabilities
- [Code Interpreter](./code-interpreter.md) - Python code execution
