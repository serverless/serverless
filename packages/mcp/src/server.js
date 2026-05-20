#!/usr/bin/env node

import express from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { hostHeaderValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js'
import { registerTools } from './tools-definition.js'
import { wrapServerWithAnalytics } from './utils/analytics-utils.js'

const LOOPBACK_HOST = '127.0.0.1'
// Matches MAXIMUM_MESSAGE_SIZE in @modelcontextprotocol/sdk/server/sse.js,
// the limit the SDK applies when it reads the raw POST stream itself.
const MAX_MESSAGE_SIZE = '4mb'

/**
 * Starts the MCP SSE server
 * @param {Object} options - Server options
 * @param {number} options.port - Port to run the server on
 * @param {Function} options.sendAnalytics - Optional function to send analytics events
 * @returns {Object} - Server instance and express app
 */
export async function startSseServer({ port = 3001, sendAnalytics } = {}) {
  // Same wiring as @modelcontextprotocol/sdk createMcpExpressApp, but with
  // a 4mb json body limit instead of express.json's 100kb default.
  const app = express()
  app.use(express.json({ limit: MAX_MESSAGE_SIZE }))
  app.use(hostHeaderValidation(['localhost', LOOPBACK_HOST, '[::1]']))

  // Create the MCP server instance.
  const server = new McpServer({
    name: 'serverless',
    version: '1.0.0',
  })

  // Add analytics tracking for tool executions if sendAnalytics function is provided
  wrapServerWithAnalytics(server, sendAnalytics)

  // Register all tools on the server
  registerTools(server)

  // Object to track active SSE transports keyed by sessionId.
  const activeTransports = {}

  /**
   * GET /sse
   * Establishes an SSE connection and stores the transport by its sessionId.
   */
  app.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/messages', res)
    await server.connect(transport)

    // Store this connection in the activeTransports map.
    activeTransports[transport.sessionId] = transport
    console.error(`Client connected: ${transport.sessionId}`)

    // When the connection closes, remove it from the map.
    res.on('close', () => {
      delete activeTransports[transport.sessionId]
      console.error(`Client disconnected: ${transport.sessionId}`)
    })
  })

  /**
   * POST /messages
   * Routes incoming JSON‑RPC messages to the correct SSE transport based on sessionId.
   * Clients must include their sessionId in the query parameters.
   */
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId
    if (!sessionId) {
      res.status(400).send('Missing sessionId in query parameters.')
      return
    }
    const transport = activeTransports[sessionId]
    if (!transport) {
      res.status(500).send('No active SSE connection for the given sessionId.')
      return
    }
    // req.body is already parsed JSON because createMcpExpressApp installs
    // express.json(); pass it through so the SDK does not try to re-read the
    // (already consumed) raw stream.
    await transport.handlePostMessage(req, res, req.body)
  })

  // Bind to loopback only. Remote clients must use SSH port forwarding.
  const httpServer = app.listen(port, LOOPBACK_HOST)
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve)
    httpServer.once('error', reject)
  })
  const boundPort = httpServer.address().port
  console.error(
    `MCP SSE server listening on http://${LOOPBACK_HOST}:${boundPort}`,
  )

  return {
    server,
    app,
    httpServer,
    port: boundPort,
    stop: () => {
      // Close all transports
      Object.values(activeTransports).forEach((transport) => {
        try {
          transport.close()
        } catch (error) {
          console.error('Error closing transport:', error)
        }
      })
      // Close the HTTP server
      return new Promise((resolve, reject) => {
        httpServer.close((err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    },
  }
}
