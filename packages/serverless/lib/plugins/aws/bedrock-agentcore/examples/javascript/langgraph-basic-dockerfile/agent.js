/**
 * Minimal LangGraph JS agent with simple built-in tools.
 *
 * This agent demonstrates:
 * - BedrockAgentCoreApp entrypoint pattern for JavaScript
 * - LangChain createAgent (backed by LangGraph) with Claude Sonnet 4.5 via Bedrock
 * - Simple tool integration (calculator, time)
 * - Docker-based deployment
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { createAgent } from 'langchain'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

// Initialize Claude Sonnet 4.5 via US inference profile
const model = new ChatBedrockConverse({
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  region: process.env.AWS_REGION || 'us-east-1',
})

// Define simple tools using the tool() helper

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

// Collect all tools
const tools = [getCurrentTime, add, multiply, divide]

// Create LangGraph agent
// This creates a graph that alternates between calling the LLM and executing tools
const agent = createAgent({
  model,
  tools,
})

// Initialize the AgentCore application with invocation handler
const app = new BedrockAgentCoreApp({
  invocationHandler: {
    // Define the expected request schema
    requestSchema: z.object({
      prompt: z.string().describe('The user message to process'),
    }),

    // Process incoming requests (non-streaming)
    async process(request, context) {
      console.log(`Received message: ${request.prompt}`)
      console.log(`Request ID: ${context?.requestId || 'unknown'}`)

      // Invoke the LangGraph agent with the user message
      const result = await agent.invoke({
        messages: [{ role: 'user', content: request.prompt }],
      })

      // Extract the final message from the graph result
      const finalMessage = result.messages[result.messages.length - 1]
      const response = finalMessage.content

      console.log(`Responding with: ${response}`)

      // Return the response (non-streaming)
      return response
    },
  },
})

// Start the AgentCore application
// This starts an HTTP server on port 8080 (default)
app.run()
