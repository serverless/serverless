/**
 * LangGraph Memory Agent
 *
 * Demonstrates conversation persistence using AgentCore Memory.
 *
 * Uses @aws-sdk/client-bedrock-agentcore directly for memory operations:
 * - CreateEventCommand: Save conversation turns as events
 * - ListEventsCommand: Retrieve conversation history (exposed as a tool)
 *
 * The LLM decides when to recall past context by invoking the list_events tool.
 * After each response, the conversation turn is saved to memory via CreateEventCommand.
 *
 * Environment variables:
 * - BEDROCK_AGENTCORE_MEMORY_ID: Memory identifier from serverless deployment
 * - MODEL_ID: Bedrock model ID (default: Claude Sonnet)
 * - AWS_REGION: AWS region
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import {
  BedrockAgentCoreClient,
  CreateEventCommand,
  ListEventsCommand,
} from '@aws-sdk/client-bedrock-agentcore'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import { z } from 'zod'

const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const MODEL_ID =
  process.env.MODEL_ID || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
const MEMORY_ID = process.env.BEDROCK_AGENTCORE_MEMORY_ID

console.log(`Memory ID: ${MEMORY_ID}`)
console.log(`Model ID: ${MODEL_ID}`)

const agentCoreClient = new BedrockAgentCoreClient({ region: AWS_REGION })

// Store current session context for tools (mirrors Python pattern)
let _currentActorId = null
let _currentSessionId = null

/**
 * Save a conversation turn to memory using CreateEventCommand.
 * Follows the official AWS SDK pattern: payload is an array of conversational items.
 */
async function saveToMemory(
  userMessage,
  assistantResponse,
  actorId,
  sessionId,
) {
  if (!MEMORY_ID || !assistantResponse?.trim()) return

  try {
    const command = new CreateEventCommand({
      memoryId: MEMORY_ID,
      actorId,
      sessionId,
      eventTimestamp: new Date(),
      payload: [
        {
          conversational: {
            content: { text: userMessage },
            role: 'USER',
          },
        },
        {
          conversational: {
            content: { text: assistantResponse },
            role: 'ASSISTANT',
          },
        },
      ],
    })

    await agentCoreClient.send(command)
    console.log(`Saved conversation to memory for session: ${sessionId}`)
  } catch (err) {
    console.error(`Error saving conversation: ${err.message}`)
  }
}

/**
 * Create the list_events tool — the LLM decides when to recall past context.
 * Mirrors the Python example's list_events tool pattern.
 */
const listEvents = tool(
  async () => {
    if (!agentCoreClient || !MEMORY_ID) {
      return 'Memory is not configured.'
    }

    try {
      const command = new ListEventsCommand({
        memoryId: MEMORY_ID,
        actorId: _currentActorId,
        sessionId: _currentSessionId,
        includePayloads: true,
        maxResults: 10,
      })

      const response = await agentCoreClient.send(command)
      const events = response.events || []

      if (events.length === 0) {
        return 'No previous conversation history found.'
      }

      // Format events for the LLM (matches Python example format)
      const history = []
      for (const event of events) {
        for (const payloadItem of event.payload || []) {
          if (payloadItem.conversational) {
            const conv = payloadItem.conversational
            const role = conv.role || 'UNKNOWN'
            const text = conv.content?.text || ''
            history.push(`${role}: ${text}`)
          }
        }
      }

      return history.length > 0 ? history.join('\n') : 'No messages found.'
    } catch (err) {
      console.error(`Error retrieving events: ${err.message}`)
      return `Error retrieving conversation history: ${err.message}`
    }
  },
  {
    name: 'list_events',
    description:
      'Retrieve recent conversation history from memory. ' +
      'Use this tool when the user asks about previous conversations, ' +
      'wants you to recall something, or references past context.',
    schema: z.object({}),
  },
)

/**
 * Create the LangGraph agent with memory tool.
 * Mirrors the Python example's graph-based agent architecture.
 */
function createAgent(actorId, sessionId) {
  _currentActorId = actorId
  _currentSessionId = sessionId

  // Initialize LLM
  const llm = new ChatBedrockConverse({
    model: MODEL_ID,
    region: AWS_REGION,
    temperature: 0.1,
  })

  const tools = [listEvents]
  const llmWithTools = llm.bindTools(tools)

  const systemMessage = `You are a helpful AI assistant with memory capabilities.

MEMORY CAPABILITIES:
- You have access to the list_events tool to retrieve previous conversation history
- Use this tool when the user asks about past conversations, wants you to remember something,
  or references information from earlier in the conversation

GUIDELINES:
- Be helpful, concise, and friendly
- When users ask you to recall or remember something, use the list_events tool
- After using the tool, summarize the relevant information for the user`

  // Define the chatbot node
  function chatbot(state) {
    const rawMessages = state.messages || []

    // Remove existing system messages to avoid duplicates
    const nonSystemMessages = rawMessages.filter(
      (msg) => !(msg instanceof SystemMessage),
    )

    // Ensure SystemMessage is first
    const messages = [new SystemMessage(systemMessage), ...nonSystemMessages]

    // Get response from model with tools bound
    return llmWithTools.invoke(messages).then((response) => ({
      messages: [...rawMessages, response],
    }))
  }

  // Create the graph
  const graphBuilder = new StateGraph(MessagesAnnotation)

  // Add nodes
  graphBuilder.addNode('chatbot', chatbot)
  graphBuilder.addNode('tools', new ToolNode(tools))

  // Add edges
  graphBuilder.addConditionalEdges('chatbot', toolsCondition)
  graphBuilder.addEdge('tools', 'chatbot')

  // Set entry point
  graphBuilder.addEdge('__start__', 'chatbot')

  // Compile and return the graph
  return graphBuilder.compile()
}

// Initialize the AgentCore application
const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({
      prompt: z.string().describe('The user message to process'),
    }),

    async process(request, context) {
      const sessionId = context?.sessionId || 'default'
      const actorId = `user-${sessionId.substring(0, 8)}`

      console.log(`Session ID: ${sessionId}`)
      console.log(`Actor ID: ${actorId}`)
      console.log(`Memory ID: ${MEMORY_ID}`)
      console.log(`Received message: ${request.prompt}`)

      try {
        // Create agent with session context
        const agent = createAgent(actorId, sessionId)

        // Invoke the agent
        const result = await agent.invoke({
          messages: [new HumanMessage(request.prompt)],
        })

        // Extract the final message content
        const finalMessage = result.messages[result.messages.length - 1]
        const response =
          typeof finalMessage.content === 'string'
            ? finalMessage.content
            : JSON.stringify(finalMessage.content)

        console.log(`Response: ${response.substring(0, 200)}...`)

        // Save to memory
        await saveToMemory(request.prompt, response, actorId, sessionId)

        return JSON.stringify({
          result: response,
          session_id: sessionId,
        })
      } catch (err) {
        console.error(`Error: ${err.message}`)
        return JSON.stringify({ error: err.message })
      }
    },
  },
})

app.run()
