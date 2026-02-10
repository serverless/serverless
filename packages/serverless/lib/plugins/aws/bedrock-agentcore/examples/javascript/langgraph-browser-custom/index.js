/**
 * LangGraph Custom Browser Agent
 *
 * Demonstrates using a custom AgentCore browser (with session recording)
 * instead of the AWS-managed default browser.
 *
 * Key difference from default browser:
 * - Default: Uses "aws.browser.v1" identifier
 * - Custom: Uses your own browser ID with custom configuration
 *
 * The custom browser is defined in serverless.yml under agents.browsers
 * and provides:
 * - Session recording to S3 for debugging/auditing
 * - Request signing for reduced CAPTCHAs
 * - Custom IAM role and network configuration
 *
 * Environment variables:
 * - CUSTOM_BROWSER_ID: Browser identifier from serverless deployment
 * - RECORDINGS_BUCKET: S3 bucket where recordings are stored
 */

/* global document */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { Browser } from 'bedrock-agentcore/browser'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { chromium } from 'playwright'

const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const MODEL_ID =
  process.env.MODEL_ID || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
const CUSTOM_BROWSER_ID = process.env.CUSTOM_BROWSER_ID
const RECORDINGS_BUCKET = process.env.RECORDINGS_BUCKET

if (!CUSTOM_BROWSER_ID) {
  console.warn('CUSTOM_BROWSER_ID not set - will use default browser')
}

console.log(`Custom Browser ID: ${CUSTOM_BROWSER_ID}`)
console.log(`Recordings Bucket: ${RECORDINGS_BUCKET}`)

// Create browser tool that uses the custom browser
const browseWebpage = tool(
  async ({ url }) => {
    console.log(`Navigating to: ${url}`)

    const browserClient = new Browser({
      region: AWS_REGION,
      identifier: CUSTOM_BROWSER_ID,
    })

    try {
      // Start session with CUSTOM browser identifier
      await browserClient.startSession()
      console.log('Started custom browser session')

      // Get WebSocket connection info
      const { url: wsUrl, headers } = await browserClient.generateWebSocketUrl()

      // Connect via Playwright
      const browser = await chromium.connectOverCDP(wsUrl, {
        headers,
        timeout: 30000,
      })

      const context = browser.contexts()[0]
      const page = context.pages()[0]

      // Navigate to URL
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

      // Extract content
      const title = await page.title()
      const content = await page.evaluate(() => {
        const body = document.body
        return body ? body.innerText.substring(0, 2000) : ''
      })

      await browser.close()

      return `Page Title: ${title}\n\nContent:\n${content}`
    } finally {
      // Stop the session - triggers recording upload to S3
      await browserClient.stopSession()
      console.log(
        'Browser session stopped - recording should be uploaded to S3',
      )
    }
  },
  {
    name: 'browse_webpage',
    description:
      'Navigate to a webpage and extract its content using a custom browser with session recording.',
    schema: z.object({
      url: z.string().describe('The URL to navigate to'),
    }),
  },
)

// Initialize LLM
const model = new ChatBedrockConverse({
  model: MODEL_ID,
  region: AWS_REGION,
})

// Create LangGraph agent with our custom browser tool
const agent = createReactAgent({
  llm: model,
  tools: [browseWebpage],
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
      console.log(`Using custom browser: ${CUSTOM_BROWSER_ID}`)

      try {
        const result = await agent.invoke({
          messages: [{ role: 'user', content: request.prompt }],
        })

        const finalMessage = result.messages[result.messages.length - 1]
        const response = finalMessage.content
        console.log(`Response: ${String(response).substring(0, 200)}...`)

        return JSON.stringify({
          result: response,
          browser_id: CUSTOM_BROWSER_ID,
          recordings_bucket: RECORDINGS_BUCKET,
        })
      } catch (err) {
        console.error(`Error: ${err.message}`)
        return JSON.stringify({ error: err.message })
      }
    },
  },
})

app.run()
