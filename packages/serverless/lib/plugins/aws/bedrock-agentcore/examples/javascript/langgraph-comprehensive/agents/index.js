/**
 * LangGraph Comprehensive Agent
 *
 * Demonstrates multiple AgentCore capabilities in a single agent:
 *
 * 1. Gateway tools (Lambda function via AgentCore Gateway)
 *    - Calculator Lambda for math expressions
 *    Discovered via BEDROCK_AGENTCORE_GATEWAY_URL with SigV4 auth
 *
 * 2. Direct MCP server (AWS Knowledge -- no gateway needed)
 *    - AWS documentation search, API references, best practices
 *    Public endpoint, no authentication required
 *
 * 3. Default browser (PlaywrightBrowser)
 *    - Web navigation, content extraction, screenshots
 *
 * 4. Default code interpreter (CodeInterpreter)
 *    - Sandboxed code execution (Python, JavaScript, TypeScript)
 *
 * 5. Memory (CreateEventCommand / ListEventsCommand)
 *    - Conversation persistence across invocations
 *    - LLM-driven recall via list_events tool
 *
 * Environment variables (auto-injected by the framework):
 * - BEDROCK_AGENTCORE_GATEWAY_URL: MCP endpoint for gateway tools
 * - BEDROCK_AGENTCORE_MEMORY_ID: Memory identifier for persistence
 * - AWS_REGION: AWS region
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { PlaywrightBrowser } from 'bedrock-agentcore/browser/playwright'
import { CodeInterpreter } from 'bedrock-agentcore/code-interpreter'
import {
  BedrockAgentCoreClient,
  CreateEventCommand,
  ListEventsCommand,
} from '@aws-sdk/client-bedrock-agentcore'
import { ChatBedrockConverse } from '@langchain/aws'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { tool } from '@langchain/core/tools'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { loadMcpTools } from '@langchain/mcp-adapters'
import { AwsV4Signer } from 'aws4fetch'
import { z } from 'zod'

const MAX_TOOL_OUTPUT_CHARS = 8000

function truncateOutput(text, maxChars = MAX_TOOL_OUTPUT_CHARS) {
  if (!text || text.length <= maxChars) return text
  return (
    text.slice(0, maxChars) + `\n\n... (truncated, ${text.length} total chars)`
  )
}

const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const MODEL_ID =
  process.env.MODEL_ID || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
const GATEWAY_URL = process.env.BEDROCK_AGENTCORE_GATEWAY_URL
const MEMORY_ID = process.env.BEDROCK_AGENTCORE_MEMORY_ID

console.log(`Model: ${MODEL_ID}`)
console.log(`Region: ${AWS_REGION}`)
console.log(`Gateway URL: ${GATEWAY_URL || '(not configured)'}`)
console.log(`Memory ID: ${MEMORY_ID || '(not configured)'}`)

const agentCoreClient = new BedrockAgentCoreClient({ region: AWS_REGION })

const llm = new ChatBedrockConverse({
  model: MODEL_ID,
  region: AWS_REGION,
})

/* ------------------------------------------------------------------ */
/*  Gateway tools (Calculator Lambda via AgentCore Gateway)           */
/* ------------------------------------------------------------------ */

async function getAwsCredentials() {
  const { defaultProvider } = await import('@aws-sdk/credential-provider-node')
  return defaultProvider()()
}

function createSignedFetch(credentials) {
  return async (url, init) => {
    const signer = new AwsV4Signer({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      service: 'bedrock-agentcore',
      region: AWS_REGION,
      url,
      method: init?.method || 'POST',
      headers: init?.headers,
      body: init?.body,
    })
    const signed = await signer.sign()
    return globalThis.fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: init?.body,
    })
  }
}

async function loadGatewayTools() {
  if (!GATEWAY_URL) {
    console.log('No BEDROCK_AGENTCORE_GATEWAY_URL -- skipping gateway tools')
    return { tools: [], cleanup: async () => {} }
  }

  console.log(`Discovering gateway tools from: ${GATEWAY_URL}`)
  const credentials = await getAwsCredentials()
  const signedFetch = createSignedFetch(credentials)

  const transport = new StreamableHTTPClientTransport(new URL(GATEWAY_URL), {
    fetch: signedFetch,
  })
  const client = new Client({
    name: 'langgraph-comprehensive-agent',
    version: '1.0.0',
  })
  await client.connect(transport)

  const tools = await loadMcpTools('gateway', client)
  for (const t of tools) {
    console.log(`  Gateway tool: ${t.name}`)
  }

  return { tools, cleanup: () => transport.close() }
}

/* ------------------------------------------------------------------ */
/*  Direct MCP server (AWS Knowledge -- public, no auth needed)       */
/* ------------------------------------------------------------------ */

const KNOWLEDGE_MCP_URL = 'https://knowledge-mcp.global.api.aws'

async function loadKnowledgeMcpTools() {
  console.log(`Connecting directly to AWS Knowledge MCP: ${KNOWLEDGE_MCP_URL}`)

  const transport = new StreamableHTTPClientTransport(
    new URL(KNOWLEDGE_MCP_URL),
  )
  const client = new Client({
    name: 'langgraph-comprehensive-knowledge',
    version: '1.0.0',
  })
  await client.connect(transport)

  const tools = await loadMcpTools('aws-knowledge', client)
  for (const t of tools) {
    console.log(`  Knowledge MCP tool: ${t.name}`)
  }

  return { tools, cleanup: () => transport.close() }
}

/* ------------------------------------------------------------------ */
/*  Browser tools (lazy -- session starts on first use)               */
/* ------------------------------------------------------------------ */

function createBrowserTools(browser) {
  let sessionStarted = false

  async function ensureSession() {
    if (!sessionStarted) {
      console.log('Starting browser session (first use)...')
      await browser.startSession()
      sessionStarted = true
    }
  }

  const navigate = tool(
    async ({ url }) => {
      await ensureSession()
      await browser.navigate({ url, waitUntil: 'domcontentloaded' })
      return `Navigated to ${url}`
    },
    {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the browser.',
      schema: z.object({
        url: z.string().describe('The URL to navigate to'),
      }),
    },
  )

  const getText = tool(
    async ({ selector }) => {
      await ensureSession()
      const text = await browser.getText({ selector })
      return truncateOutput(text) || 'No text found'
    },
    {
      name: 'browser_get_text',
      description:
        'Extract text content from the page or a specific element. Omit selector for full page text.',
      schema: z.object({
        selector: z
          .string()
          .optional()
          .describe('CSS selector (omit for full page text)'),
      }),
    },
  )

  const clickElement = tool(
    async ({ selector }) => {
      await ensureSession()
      await browser.click({ selector })
      return `Clicked element: ${selector}`
    },
    {
      name: 'browser_click',
      description: 'Click an element on the page by CSS selector.',
      schema: z.object({
        selector: z.string().describe('CSS selector of the element to click'),
      }),
    },
  )

  const screenshot = tool(
    async () => {
      await ensureSession()
      const data = await browser.screenshot({
        fullPage: false,
        encoding: 'base64',
      })
      return `Screenshot captured (base64, ${String(data).length} chars)`
    },
    {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page.',
      schema: z.object({}),
    },
  )

  const cleanup = async () => {
    if (sessionStarted) {
      await browser.stopSession()
    }
  }

  return { tools: [navigate, getText, clickElement, screenshot], cleanup }
}

/* ------------------------------------------------------------------ */
/*  Code interpreter tools (lazy -- session starts on first use)      */
/* ------------------------------------------------------------------ */

function createCodeInterpreterTools(codeInterpreter) {
  let sessionStarted = false

  async function ensureSession() {
    if (!sessionStarted) {
      console.log('Starting code interpreter session (first use)...')
      await codeInterpreter.startSession()
      sessionStarted = true
    }
  }

  const executeCode = tool(
    async ({ code, language }) => {
      await ensureSession()
      console.log(`Executing ${language || 'python'} code...`)
      const result = await codeInterpreter.executeCode({
        code,
        language: language || 'python',
      })
      return result || 'Code executed successfully (no output)'
    },
    {
      name: 'execute_code',
      description:
        'Execute code in a secure sandbox. Supports Python, JavaScript, and TypeScript.',
      schema: z.object({
        code: z.string().describe('Code to execute'),
        language: z
          .enum(['python', 'javascript', 'typescript'])
          .optional()
          .describe('Programming language (default: python)'),
      }),
    },
  )

  const executeCommand = tool(
    async ({ command }) => {
      await ensureSession()
      console.log(`Executing command: ${command}`)
      const result = await codeInterpreter.executeCommand({ command })
      return result || 'Command executed successfully (no output)'
    },
    {
      name: 'execute_command',
      description: 'Execute a shell command in the sandbox.',
      schema: z.object({
        command: z.string().describe('Shell command to execute'),
      }),
    },
  )

  const cleanup = async () => {
    if (sessionStarted) {
      await codeInterpreter.stopSession()
    }
  }

  return { tools: [executeCode, executeCommand], cleanup }
}

/* ------------------------------------------------------------------ */
/*  Memory tools (list_events + automatic save)                       */
/* ------------------------------------------------------------------ */

let _currentActorId = null
let _currentSessionId = null

const listEvents = tool(
  async () => {
    if (!MEMORY_ID) return 'Memory is not configured.'

    try {
      const response = await agentCoreClient.send(
        new ListEventsCommand({
          memoryId: MEMORY_ID,
          actorId: _currentActorId,
          sessionId: _currentSessionId,
          includePayloads: true,
          maxResults: 10,
        }),
      )

      const events = response.events || []
      if (events.length === 0) return 'No previous conversation history found.'

      const history = []
      for (const event of events) {
        for (const item of event.payload || []) {
          if (item.conversational) {
            const { role, content } = item.conversational
            history.push(`${role || 'UNKNOWN'}: ${content?.text || ''}`)
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
      'Use this when the user asks about previous conversations, ' +
      'wants you to recall something, or references past context.',
    schema: z.object({}),
  },
)

/**
 * Load the most recent conversation events for the current session and
 * convert them to LangChain-compatible message objects so they can be
 * prepended to the invocation as automatic context.
 */
async function loadRecentHistory(sessionId, actorId) {
  if (!MEMORY_ID) return []
  try {
    const response = await agentCoreClient.send(
      new ListEventsCommand({
        memoryId: MEMORY_ID,
        actorId,
        sessionId,
        includePayloads: true,
        maxResults: 3,
      }),
    )
    const messages = []
    for (const event of response.events || []) {
      for (const item of event.payload || []) {
        if (item.conversational) {
          const role =
            item.conversational.role === 'USER' ? 'user' : 'assistant'
          const text = item.conversational.content?.text || ''
          if (text) messages.push({ role, content: text })
        }
      }
    }
    return messages
  } catch (err) {
    console.error(`Error loading recent history: ${err.message}`)
    return []
  }
}

async function saveToMemory(
  userMessage,
  assistantResponse,
  actorId,
  sessionId,
) {
  if (!MEMORY_ID || !assistantResponse?.trim()) return

  try {
    await agentCoreClient.send(
      new CreateEventCommand({
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
      }),
    )
    console.log(`Saved conversation to memory for session: ${sessionId}`)
  } catch (err) {
    console.error(`Error saving conversation: ${err.message}`)
  }
}

/* ------------------------------------------------------------------ */
/*  Agent application                                                 */
/* ------------------------------------------------------------------ */

const browser = new PlaywrightBrowser({ region: AWS_REGION })

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({
      prompt: z.string().describe('The user message to process'),
    }),

    async *process(request, context) {
      const sessionId = context?.sessionId || 'default'
      const actorId = `user-${sessionId.substring(0, 8)}`
      _currentActorId = actorId
      _currentSessionId = sessionId

      console.log(`Session: ${sessionId}`)
      console.log(`Prompt: ${request.prompt}`)

      const codeInterpreter = new CodeInterpreter({ region: AWS_REGION })
      let gatewayCleanup = async () => {}
      let knowledgeCleanup = async () => {}
      let browserCleanup = async () => {}
      let codeCleanup = async () => {}

      try {
        /**
         * Collect tools from all sources in parallel where possible:
         * - Gateway tools (calculator Lambda via AgentCore Gateway)
         * - Direct MCP tools (AWS Knowledge MCP server)
         * - Browser tools (lazy -- session starts on first use)
         * - Code interpreter tools (lazy -- session starts on first use)
         * - Memory tool (list_events)
         */
        const [gateway, knowledge] = await Promise.all([
          loadGatewayTools(),
          loadKnowledgeMcpTools(),
        ])
        gatewayCleanup = gateway.cleanup
        knowledgeCleanup = knowledge.cleanup

        const browserResult = createBrowserTools(browser)
        const codeResult = createCodeInterpreterTools(codeInterpreter)
        browserCleanup = browserResult.cleanup
        codeCleanup = codeResult.cleanup

        const allTools = [
          ...gateway.tools,
          ...knowledge.tools,
          ...browserResult.tools,
          ...codeResult.tools,
          ...(MEMORY_ID ? [listEvents] : []),
        ]

        console.log(
          `Agent tools (${allTools.length}): ${allTools.map((t) => t.name).join(', ')}`,
        )

        const agent = createReactAgent({ llm, tools: allTools })

        const recentHistory = await loadRecentHistory(sessionId, actorId)
        if (recentHistory.length > 0) {
          console.log(`Loaded ${recentHistory.length} messages from memory`)
        }

        /**
         * Use streamMode:"messages" to get token-level chunks from the LLM
         * as they arrive instead of waiting for the full response.
         * Each iteration yields [AIMessageChunk, metadata]; we forward only
         * AI text tokens and skip tool-call chunks and ToolMessages.
         */
        const stream = await agent.stream(
          {
            messages: [
              ...recentHistory,
              { role: 'user', content: request.prompt },
            ],
          },
          { streamMode: 'messages' },
        )

        let response = ''
        for await (const [chunk] of stream) {
          const isAiChunk =
            chunk?.constructor?.name === 'AIMessageChunk' ||
            chunk?._getType?.() === 'ai'

          if (!isAiChunk || chunk.tool_call_chunks?.length > 0) continue

          const text =
            typeof chunk.content === 'string'
              ? chunk.content
              : Array.isArray(chunk.content)
                ? chunk.content
                    .filter((b) => b.type === 'text')
                    .map((b) => b.text)
                    .join('')
                : ''

          if (text) {
            response += text
            yield text
          }
        }

        console.log(`Response: ${response.substring(0, 200)}...`)

        await saveToMemory(request.prompt, response, actorId, sessionId)
      } catch (err) {
        console.error(`Error: ${err.message}`)
        yield JSON.stringify({ error: err.message })
      } finally {
        await Promise.allSettled([
          browserCleanup(),
          codeCleanup(),
          gatewayCleanup(),
          knowledgeCleanup(),
        ])
        console.log('Cleanup complete')
      }
    },
  },
})

app.run()
