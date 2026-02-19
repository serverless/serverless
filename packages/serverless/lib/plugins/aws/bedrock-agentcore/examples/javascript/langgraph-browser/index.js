/**
 * LangGraph Browser Agent
 *
 * Demonstrates using AgentCore Browser with LangGraph JS for:
 * - Web navigation and content extraction
 * - Form interactions and element clicking
 * - Screenshots and page analysis
 *
 * Uses PlaywrightBrowser from bedrock-agentcore for browser automation.
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { PlaywrightBrowser } from 'bedrock-agentcore/browser/playwright'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const MODEL_ID =
  process.env.MODEL_ID || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'

// Initialize the browser client at module level
const browser = new PlaywrightBrowser({ region: AWS_REGION })
console.log('PlaywrightBrowser initialized')

// Define browser tools wrapping PlaywrightBrowser methods

const navigate = tool(
  async ({ url, waitUntil }) => {
    await browser.navigate({ url, waitUntil: waitUntil || 'domcontentloaded' })
    return `Navigated to ${url}`
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL in the browser.',
    schema: z.object({
      url: z.string().describe('The URL to navigate to'),
      waitUntil: z
        .enum(['load', 'domcontentloaded', 'networkidle'])
        .optional()
        .describe('When to consider navigation complete'),
    }),
  },
)

const clickElement = tool(
  async ({ selector }) => {
    await browser.click({ selector })
    return `Clicked element: ${selector}`
  },
  {
    name: 'click',
    description: 'Click an element on the page by CSS selector.',
    schema: z.object({
      selector: z.string().describe('CSS selector of the element to click'),
    }),
  },
)

const typeText = tool(
  async ({ selector, text }) => {
    await browser.type({ selector, text })
    return `Typed "${text}" into ${selector}`
  },
  {
    name: 'type_text',
    description: 'Type text into an input element.',
    schema: z.object({
      selector: z.string().describe('CSS selector of the input element'),
      text: z.string().describe('Text to type'),
    }),
  },
)

const getText = tool(
  async ({ selector }) => {
    const text = await browser.getText({ selector })
    return text || 'No text found'
  },
  {
    name: 'get_text',
    description:
      'Extract text content from the page or a specific element. Omit selector to get all page text.',
    schema: z.object({
      selector: z
        .string()
        .optional()
        .describe('CSS selector (omit for full page text)'),
    }),
  },
)

const getHtml = tool(
  async ({ selector }) => {
    const html = await browser.getHtml({ selector })
    return html || 'No HTML found'
  },
  {
    name: 'get_html',
    description:
      'Get the HTML content of the page or a specific element. Omit selector for full page HTML.',
    schema: z.object({
      selector: z
        .string()
        .optional()
        .describe('CSS selector (omit for full page HTML)'),
    }),
  },
)

const screenshot = tool(
  async ({ fullPage }) => {
    const data = await browser.screenshot({
      fullPage: fullPage ?? false,
      encoding: 'base64',
    })
    return `Screenshot captured (base64, ${String(data).length} chars)`
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page.',
    schema: z.object({
      fullPage: z
        .boolean()
        .optional()
        .describe('Whether to capture the full page (default: false)'),
    }),
  },
)

const evaluate = tool(
  async ({ script }) => {
    const result = await browser.evaluate({ script })
    return JSON.stringify(result)
  },
  {
    name: 'evaluate',
    description: 'Execute JavaScript in the browser page context.',
    schema: z.object({
      script: z.string().describe('JavaScript code to execute in the page'),
    }),
  },
)

const waitForElement = tool(
  async ({ selector, timeout }) => {
    await browser.waitForSelector({ selector, timeout: timeout || 5000 })
    return `Element found: ${selector}`
  },
  {
    name: 'wait_for_element',
    description: 'Wait for an element to appear on the page.',
    schema: z.object({
      selector: z.string().describe('CSS selector to wait for'),
      timeout: z
        .number()
        .optional()
        .describe('Maximum time to wait in ms (default: 5000)'),
    }),
  },
)

// Wrap tools with logging to trace LLM tool calls and result sizes
function withLogging(t) {
  const original = t.func
  t.func = async (input) => {
    console.log(
      `[Tool Call] ${t.name} | Input: ${JSON.stringify(input).substring(0, 500)}`,
    )
    const result = await original(input)
    const resultStr = String(result)
    console.log(
      `[Tool Result] ${t.name} | Output length: ${resultStr.length} chars`,
    )
    if (resultStr.length > 1000) {
      console.log(
        `[Tool Result] ${t.name} | Preview: ${resultStr.substring(0, 500)}...`,
      )
    }
    return result
  }
  return t
}

// Collect all browser tools with logging
const tools = [
  navigate,
  clickElement,
  typeText,
  getText,
  getHtml,
  screenshot,
  evaluate,
  waitForElement,
].map(withLogging)

// Initialize LLM
const model = new ChatBedrockConverse({
  model: MODEL_ID,
  region: AWS_REGION,
})

// Create LangGraph ReAct agent with browser tools
const agent = createReactAgent({
  llm: model,
  tools,
})

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
        // Start browser session
        await browser.startSession()
        console.log('Browser session started')

        // Run the agent
        const result = await agent.invoke({
          messages: [{ role: 'user', content: request.prompt }],
        })

        const finalMessage = result.messages[result.messages.length - 1]
        const response = finalMessage.content
        console.log(`Response: ${String(response).substring(0, 200)}...`)

        return response
      } catch (err) {
        console.error(`Error: ${err.message}`)
        return `Error: ${err.message}`
      } finally {
        try {
          await browser.stopSession()
          console.log('Browser session stopped')
        } catch {
          // ignore cleanup errors
        }
      }
    },
  },
})

app.run()
