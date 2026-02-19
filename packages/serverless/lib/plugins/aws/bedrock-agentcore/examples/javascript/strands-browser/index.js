/**
 * Strands Browser Agent (JavaScript)
 *
 * Demonstrates using AgentCore Browser with Strands Agents SDK for:
 * - Web navigation and content extraction
 * - Financial data analysis
 * - Research and information gathering
 *
 * Uses @strands-agents/sdk with ready-made browser tools from
 * bedrock-agentcore/experimental/browser/strands.
 *
 * Environment variables:
 * - MODEL_ID: Bedrock model ID (default: Claude Sonnet)
 * - AWS_REGION: AWS region (auto-injected by AgentCore)
 * - BYPASS_TOOL_CONSENT: Set to "true" for automated deployments
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { Agent, SlidingWindowConversationManager } from '@strands-agents/sdk'
import { BrowserTools } from 'bedrock-agentcore/experimental/browser/strands'
import { z } from 'zod'

const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const MODEL_ID =
  process.env.MODEL_ID || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'

// Bypass tool consent for automated deployments
process.env.BYPASS_TOOL_CONSENT = 'true'

console.log(`Region: ${AWS_REGION}`)
console.log(`Model: ${MODEL_ID}`)

// Initialize browser tools at module level
const browserTools = new BrowserTools({ region: AWS_REGION })
console.log('Browser tools initialized')

const SYSTEM_PROMPT = `You are an intelligent research assistant with web browsing capabilities.

Your capabilities:
- Navigate to websites and extract information
- Analyze financial data from stock market websites
- Research topics by visiting multiple sources
- Extract structured data from web pages

Guidelines:
1. Use the browser tool efficiently - aim for 2-3 interactions per task
2. Extract specific data points with actual numbers
3. Summarize findings clearly with sources
4. Handle errors gracefully and try alternative approaches

For financial analysis, focus on:
- Current prices and trends
- Key metrics (P/E, Market Cap, Volume)
- Recent news and market sentiment
- Analyst recommendations`

/**
 * Create a Strands agent with browser capabilities.
 */
function createAgent() {
  const conversationManager = new SlidingWindowConversationManager({
    windowSize: 25,
    perTurn: true,
  })

  return new Agent({
    model: MODEL_ID,
    tools: browserTools.tools,
    conversationManager,
    systemPrompt: SYSTEM_PROMPT,
  })
}

// Initialize the AgentCore application
const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({
      prompt: z.string().describe('The user message to process'),
    }),

    async process(request, context) {
      const sessionId = context?.sessionId || 'default'
      console.log(`Session ID: ${sessionId}`)
      console.log(`Prompt: ${request.prompt}`)
      console.log(`Model: ${MODEL_ID}`)

      try {
        // Create agent for this request
        const agent = createAgent()

        // Invoke the agent (non-streaming for simplicity)
        const result = await agent.invoke(request.prompt)

        const response =
          typeof result === 'string' ? result : JSON.stringify(result)
        console.log(`Response: ${response.substring(0, 200)}...`)

        return response
      } catch (err) {
        console.error(`Error: ${err.message}`)
        return JSON.stringify({ error: err.message })
      }
    },
  },
})

app.run()
