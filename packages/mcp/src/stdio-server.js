#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools-definition.js'
import { wrapServerWithAnalytics } from './utils/analytics-utils.js'

/**
 * Starts the MCP stdio server
 * @param {Object} options - Server options
 * @param {Function} options.sendAnalytics - Optional function to send analytics events
 * @returns {Object} - Server instance and transport
 */
export async function startStdioServer({ sendAnalytics } = {}) {
  // Create the MCP server instance.
  const server = new McpServer({
    name: 'serverless',
    version: '1.0.0',
  })

  // Add analytics tracking for tool executions if sendAnalytics function is provided
  wrapServerWithAnalytics(server, sendAnalytics)

  // Register all tools on the server
  registerTools(server)

  try {
    // Set up stdio transport
    const transport = new StdioServerTransport()
    console.error('Connecting server to transport...')
    await server.connect(transport)
    console.error('MCP stdio server started and connected to transport.')

    return {
      server,
      transport,
      stop: async () => {
        try {
          await transport.close()
          return true
        } catch (error) {
          console.error('Error stopping stdio server:', error)
          return false
        }
      },
    }
  } catch (error) {
    console.error('Error starting MCP stdio server:', error)
    throw error
  }
}
