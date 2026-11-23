<!--
title: AgentCore Memory
description: Give AI agents conversation history and long-term memory with Amazon Bedrock AgentCore Memory, inline on an agent or shared between agents.
short_title: Memory
keywords:
  [
    'Serverless Framework',
    'Amazon Bedrock AgentCore Memory',
    'AI agent memory',
    'conversation history',
    'long-term memory strategies',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/agents/memory)

<!-- DOCS-SITE-LINK:END -->

# AgentCore Memory for agents

Amazon Bedrock AgentCore Memory stores an agent's conversation events (short-term memory) and, with memory strategies, extracts facts, summaries and preferences from them (long-term memory). In `serverless.yml`, set `memory` on an agent, or define memory under `ai.memory` and share it between agents; the Framework creates the memory resource and its role, gives the agent access, and sets `BEDROCK_AGENTCORE_MEMORY_ID` in the agent's environment.

This agent gets its own memory, which keeps events for 30 days:

```yaml
# serverless.yml
ai:
  agents:
    assistant:
      memory:
        expiration: 30
```

AgentCore Memory doesn't record conversations by itself: the agent code saves each turn and reads history back, as [Use memory in agent code](#use-memory-in-agent-code) shows.

## Use memory in agent code

Memory organizes events by actor ID (the user or entity the memory belongs to) and session ID (one conversation). The agent chooses both: for example, the user ID from the request and the AgentCore session ID. Requests with the same actor and session read the same history.

In Python, the [Amazon Bedrock AgentCore SDK](https://github.com/aws/bedrock-agentcore-sdk-python) provides `MemoryClient`:

```python
import os

from bedrock_agentcore.memory import MemoryClient

MEMORY_ID = os.environ["BEDROCK_AGENTCORE_MEMORY_ID"]
memory = MemoryClient(region_name=os.environ["AWS_REGION"])

memory.create_event(
    memory_id=MEMORY_ID,
    actor_id="user-123",
    session_id="session-456",
    messages=[
        ("What's the weather?", "USER"),
        ("Today is sunny.", "ASSISTANT"),
    ],
)

events = memory.list_events(
    memory_id=MEMORY_ID,
    actor_id="user-123",
    session_id="session-456",
    max_results=10,
)
```

For Strands Agents, the same SDK provides `AgentCoreMemorySessionManager` in `bedrock_agentcore.memory.integrations.strands`, which saves and loads the conversation for you.

In JavaScript, use `@aws-sdk/client-bedrock-agentcore`:

```javascript
import {
  BedrockAgentCoreClient,
  CreateEventCommand,
  ListEventsCommand,
} from '@aws-sdk/client-bedrock-agentcore'

const MEMORY_ID = process.env.BEDROCK_AGENTCORE_MEMORY_ID
const client = new BedrockAgentCoreClient()

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
          content: { text: 'Today is sunny.' },
          role: 'ASSISTANT',
        },
      },
    ],
  }),
)

const { events } = await client.send(
  new ListEventsCommand({
    memoryId: MEMORY_ID,
    actorId: 'user-123',
    sessionId: 'session-456',
    maxResults: 10,
  }),
)
```

The agent's generated role allows `CreateEvent`, `GetEvent`, `ListEvents`, `DeleteEvent`, `ListSessions`, `ListActors`, `RetrieveMemoryRecords`, `ListMemoryRecords`, `GetMemoryRecord` and `GetMemory` on its memory.

## Share memory between agents

To let several agents read and write the same memory, define it under `ai.memory` and reference it by name in each agent's `memory`:

```yaml
ai:
  memory:
    conversations:
      expiration: 90
      description: Conversation memory shared by the support agents

  agents:
    triage:
      memory: conversations
    specialist:
      memory: conversations
```

An agent's `memory` is either the name of an entry in `ai.memory` or an inline memory object. An inline memory belongs to one agent and is named `<agent>-memory` in the stack. A name that isn't in `ai.memory` stops the deployment.

## Extract long-term memory with strategies

Memory strategies turn events into long-term memory records that the agent retrieves with `RetrieveMemoryRecords`. Each entry in `strategies` has one strategy type as its key, with the AWS property names:

```yaml
ai:
  memory:
    conversations:
      expiration: 90
      strategies:
        - SemanticMemoryStrategy:
            Name: Facts
            Description: Facts the user shared
            Namespaces:
              - /facts/{actorId}/
        - SummaryMemoryStrategy:
            Name: SessionSummaries
            Namespaces:
              - /summaries/{actorId}/{sessionId}/
        - UserPreferenceMemoryStrategy:
            Name: Preferences
            Namespaces:
              - /preferences/{actorId}/
```

| Strategy                       | Extracts                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `SemanticMemoryStrategy`       | Facts and knowledge from conversations                                          |
| `SummaryMemoryStrategy`        | A running summary of each session                                               |
| `UserPreferenceMemoryStrategy` | User preferences and choices                                                    |
| `EpisodicMemoryStrategy`       | Episodes of interactions, with optional reflections (`ReflectionConfiguration`) |
| `CustomMemoryStrategy`         | One of the above with your own prompt and model (`Configuration`)               |

Every strategy needs `Name`, which matches `^[a-zA-Z][a-zA-Z0-9_]{0,47}$`. `Description` and `Namespaces` are optional. A namespace is a path that groups the extracted records, and can use the variables `{actorId}`, `{sessionId}` and `{memoryStrategyId}`; see [Memory organization](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-organization.html). The Framework passes the strategies to AWS unchanged, so every property of [`AWS::BedrockAgentCore::Memory` MemoryStrategy](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-bedrockagentcore-memory-memorystrategy.html) works.

`CustomMemoryStrategy` takes a `Configuration` with one override, for example to change the extraction prompt and model of semantic memory:

```yaml
ai:
  memory:
    travel:
      strategies:
        - CustomMemoryStrategy:
            Name: TravelFacts
            Namespaces:
              - /travel/{actorId}/
            Configuration:
              SemanticOverride:
                Extraction:
                  AppendToPrompt: Extract only facts about the user's travel plans.
                  ModelId: us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

`Configuration` takes one of `SemanticOverride`, `SummaryOverride`, `UserPreferenceOverride`, `EpisodicOverride` or `SelfManagedConfiguration`, as defined in [CustomMemoryStrategy](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-bedrockagentcore-memory-custommemorystrategy.html).

## Expire long-term memory records

Long-term memory records don't expire unless their strategy sets a time-to-live. To delete the records a strategy extracts after a number of days, set the strategy's `RecordExpirySpecification`; `RecordExpiryDurationDays` is at least `31`:

```yaml
ai:
  memory:
    conversations:
      strategies:
        - SemanticMemoryStrategy:
            Name: Facts
            Namespaces:
              - /facts/{actorId}/
            RecordExpirySpecification:
              RecordExpiryDurationDays: 90
```

The memory's `expiration` applies to events only, so set both to limit how long the memory keeps data. Setting or changing a strategy's record expiry needs the `bedrock-agentcore:UpdateMemoryRecordExpirySpecification` permission for the credentials that deploy the service, on top of the permissions to create and update the memory.

The agent's generated role doesn't need this permission to read records. An agent that writes long-term records itself, with `BatchCreateMemoryRecords` or `BatchUpdateMemoryRecords`, needs those actions and `bedrock-agentcore:UpdateMemoryRecordExpirySpecification` in its role's `statements`, because AWS checks the expiry permission on both calls:

```yaml
ai:
  agents:
    assistant:
      memory: conversations
      role:
        statements:
          - Effect: Allow
            Action:
              - bedrock-agentcore:BatchCreateMemoryRecords
              - bedrock-agentcore:BatchUpdateMemoryRecords
              - bedrock-agentcore:UpdateMemoryRecordExpirySpecification
            Resource: !GetAtt ConversationsMemory.MemoryArn
```

See the IAM actions in the [Service Authorization Reference for Amazon Bedrock AgentCore](https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonbedrockagentcore.html).

## Event expiration and encryption

`expiration` is the number of days AgentCore keeps events, from 3 to 3650 (10 years); the default is 30. `encryptionKey` takes the ARN of an AWS KMS key that encrypts the memory; without it, AgentCore encrypts the memory with a service-managed key. The credentials that deploy the service need `kms:CreateGrant`, `kms:Decrypt`, `kms:DescribeKey` and `kms:GenerateDataKey` on the key, as [Encrypt your AgentCore Memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/storage-encryption.html) describes:

```yaml
ai:
  memory:
    conversations:
      expiration: 180
      encryptionKey: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
```

## IAM role for memory

AgentCore uses the memory's execution role to call Bedrock models when it extracts long-term memory. Without `role`, the Framework creates one per memory, named `<service>_<memory>_memory_role_<stage>` (truncated to 48 characters), with the AWS managed policy `AmazonBedrockAgentCoreMemoryBedrockModelInferenceExecutionRolePolicy`.

To add permissions, set `role` to an object. The managed policy stays attached, and `statements` go into an extra inline policy:

```yaml
ai:
  memory:
    conversations:
      role:
        statements:
          - Effect: Allow
            Action: kms:Decrypt
            Resource: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
        tags:
          Team: ai
```

`role` takes the same forms as an agent's role: an object with `name`, `statements`, `managedPolicies`, `permissionsBoundary` and `tags`, or an ARN, a logical ID or a CloudFormation intrinsic to use a role you manage. See [IAM role for an agent](./runtime.md#iam-role-for-an-agent).

## Memory configuration reference

These keys apply to entries in `ai.memory` and to inline `memory` objects on agents:

| Key             | Type             | Default             | Value                                           |
| --------------- | ---------------- | ------------------- | ----------------------------------------------- |
| `expiration`    | number           | `30`                | Days to keep events, 3 to 3650                  |
| `strategies`    | list             | None                | Long-term memory strategies                     |
| `encryptionKey` | string           | Service-managed key | KMS key ARN                                     |
| `description`   | string           | None                | 1 to 1,200 characters                           |
| `role`          | string or object | Generated role      | See [IAM role for memory](#iam-role-for-memory) |
| `tags`          | map of strings   | None                | Tags on the memory                              |

For a memory named `conversations`, the stack contains `ConversationsMemory` (an `AWS::BedrockAgentCore::Memory` named `<service>_conversations_<stage>`, truncated to 48 characters) and `ConversationsMemoryRole`, and outputs `ConversationsMemoryArn` (exported as `<service>-<stage>-conversations-MemoryArn`), `ConversationsMemoryId` and `ConversationsMemoryRoleArn`.

## Examples

- [LangGraph with memory (JavaScript)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/javascript/langgraph-memory) and [(Python)](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore/python/langgraph-memory).
- More in the [Amazon Bedrock AgentCore examples](https://github.com/serverless/examples/tree/v4/aws-bedrock-agentcore).

## Related pages

- [AgentCore Runtime agents](./runtime.md): the agent settings, including `memory`.
- [AgentCore Gateway tools](./gateway.md): give the agent tools.
- [Amazon Bedrock AgentCore Memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html) in the AgentCore developer guide.
