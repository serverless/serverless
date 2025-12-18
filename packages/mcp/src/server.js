#!/usr/bin/env node

import express from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { registerTools } from './tools-definition.js'
import { wrapServerWithAnalytics } from './utils/analytics-utils.js'

/**
 * Starts the MCP SSE server
 * @param {Object} options - Server options
 * @param {number} options.port - Port to run the server on
 * @param {Function} options.sendAnalytics - Optional function to send analytics events
 * @returns {Object} - Server instance and express app
 */
export async function startSseServer({ port = 3001, sendAnalytics } = {}) {
  const app = express()
  // IMPORTANT: Do not add any global body-parsing middleware so that the raw POST stream remains available

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
    await transport.handlePostMessage(req, res)
  })

  // Start the server
  const httpServer = app.listen(port, () => {
    console.error(`MCP SSE server listening on http://localhost:${port}`)
  })

  return {
    server,
    app,
    httpServer,
    port,
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
