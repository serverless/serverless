/**
 * MCP Server for AWS Bedrock AgentCore Runtime
 *
 * A stateless MCP server exposing simple tools via the Model Context Protocol.
 * Uses Express + @modelcontextprotocol/sdk with Streamable HTTP transport.
 *
 * Tools:
 *   - add: Add two numbers
 *   - multiply: Multiply two numbers
 *   - get_current_time: Get the current date and time
 */

import express from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// MCP Server factory — creates a fresh stateless server per request
// ---------------------------------------------------------------------------

const createMcpServer = () => {
  const server = new McpServer({
    name: 'mcp-server',
    version: '1.0.0',
  })

  // Tool: add two numbers
  server.registerTool(
    'add',
    {
      title: 'Addition',
      description: 'Add two numbers together',
      inputSchema: {
        a: z.number().describe('First number'),
        b: z.number().describe('Second number'),
      },
    },
    async ({ a, b }) => ({
      content: [{ type: 'text', text: String(a + b) }],
    }),
  )

  // Tool: multiply two numbers
  server.registerTool(
    'multiply',
    {
      title: 'Multiplication',
      description: 'Multiply two numbers together',
      inputSchema: {
        a: z.number().describe('First number'),
        b: z.number().describe('Second number'),
      },
    },
    async ({ a, b }) => ({
      content: [{ type: 'text', text: String(a * b) }],
    }),
  )

  // Tool: get current time
  server.registerTool(
    'get_current_time',
    {
      title: 'Current Time',
      description:
        'Get the current date and time. Optionally specify a timezone.',
      inputSchema: {
        timezone: z
          .string()
          .optional()
          .describe(
            'Timezone (e.g. "America/New_York", "Europe/London", "UTC")',
          ),
      },
    },
    async ({ timezone }) => {
      const now = new Date()
      const options = {
        timeZone: timezone || 'UTC',
        dateStyle: 'full',
        timeStyle: 'long',
      }
      return {
        content: [{ type: 'text', text: now.toLocaleString('en-US', options) }],
      }
    },
  )

  return server
}

// ---------------------------------------------------------------------------
// Express HTTP layer — stateless Streamable HTTP on port 8000
// ---------------------------------------------------------------------------

const PORT = 8000
const app = express()
app.use(express.json())

// POST /mcp — handle MCP JSON-RPC requests (stateless)
app.post('/mcp', async (req, res) => {
  const server = createMcpServer()
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — no persistent sessions
      enableJsonResponse: true,
    })
    await server.connect(transport)
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('Error handling MCP request:', error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      })
    }
  }
})

// GET /mcp — method not allowed per MCP spec
app.get('/mcp', (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    }),
  )
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP server running on http://0.0.0.0:${PORT}/mcp`)
})
