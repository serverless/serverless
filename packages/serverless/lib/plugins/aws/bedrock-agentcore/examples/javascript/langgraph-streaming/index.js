/**
 * LangGraph JS agent with real-time LLM token streaming.
 *
 * This agent demonstrates:
 * - BedrockAgentCoreApp streaming via async generator (async function*)
 * - LangGraph JS stream() API with streamMode: "messages" for token-level streaming
 * - Server-Sent Events (SSE) delivery to clients
 * - Claude Sonnet 4.5 via Bedrock with simple tool integration
 * - No Dockerfile needed - container image built automatically from source
 *
 * The process handler yields each LLM token as it is generated,
 * enabling real-time response delivery instead of waiting for the full response.
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { createAgent } from 'langchain'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

/**
 * Initialize Claude Sonnet 4.5 via US inference profile
 */
const model = new ChatBedrockConverse({
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  region: process.env.AWS_REGION || 'us-east-1',
})

/**
 * Get the current date and time
 */
const getCurrentTime = tool(
  async ({ timezone }) => {
    const now = new Date()
    const options = {
      timeZone: timezone || 'UTC',
      dateStyle: 'full',
      timeStyle: 'long',
    }
    return `Current time: ${now.toLocaleString('en-US', options)}`
  },
  {
    name: 'get_current_time',
    description:
      'Get the current date and time. Optionally specify a timezone.',
    schema: z.object({
      timezone: z
        .string()
        .optional()
        .describe(
          'Timezone (e.g., "America/New_York", "Europe/London", "UTC")',
        ),
    }),
  },
)

/**
 * Add two numbers together
 */
const add = tool(
  async ({ a, b }) => {
    const result = a + b
    return `${a} + ${b} = ${result}`
  },
  {
    name: 'add',
    description: 'Add two numbers together.',
    schema: z.object({
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
  },
)

/**
 * Multiply two numbers together
 */
const multiply = tool(
  async ({ a, b }) => {
    const result = a * b
    return `${a} × ${b} = ${result}`
  },
  {
    name: 'multiply',
    description: 'Multiply two numbers together.',
    schema: z.object({
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
  },
)

/**
 * Divide two numbers
 */
const divide = tool(
  async ({ a, b }) => {
    if (b === 0) {
      return 'Error: Cannot divide by zero'
    }
    const result = a / b
    return `${a} ÷ ${b} = ${result}`
  },
  {
    name: 'divide',
    description: 'Divide two numbers.',
    schema: z.object({
      a: z.number().describe('Dividend (number to divide)'),
      b: z.number().describe('Divisor (number to divide by)'),
    }),
  },
)

const tools = [getCurrentTime, add, multiply, divide]

/**
 * Create LangGraph agent
 */
const agent = createAgent({
  model,
  tools,
})

/**
 * Initialize the AgentCore application with a streaming invocation handler.
 *
 * The process method is an async generator (async function*) that yields
 * LLM tokens as they are produced. The BedrockAgentCoreApp runtime detects
 * the async generator and automatically streams chunks to the client via SSE.
 *
 * LangGraph streamMode: "messages" emits [message, metadata] tuples for each
 * token. We filter for AI message chunks and yield their text content.
 */
const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({
      prompt: z.string().describe('The user message to process'),
    }),

    async *process(request, context) {
      console.log(`Received message: ${request.prompt}`)
      console.log(`Request ID: ${context?.requestId || 'unknown'}`)

      /**
       * Stream LLM tokens using LangGraph's streamMode: "messages".
       * Each chunk is a [message, metadata] tuple where message is a
       * BaseMessageChunk (AIMessageChunk for LLM output).
       */
      const stream = await agent.stream(
        { messages: [{ role: 'user', content: request.prompt }] },
        { streamMode: 'messages' },
      )

      for await (const [message, metadata] of stream) {
        /**
         * Only yield AI message chunks that contain text content.
         * This filters out tool call chunks, tool response messages,
         * and empty chunks.
         */
        if (
          message._getType() === 'ai' &&
          message.content &&
          typeof message.content === 'string'
        ) {
          yield message.content
        }
      }
    },
  },
})

/**
 * Start the AgentCore application.
 * The runtime serves on port 8080 (default) with SSE support on /invocations.
 */
app.run()
