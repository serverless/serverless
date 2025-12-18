/**
 * Utility functions for MCP Server analytics
 */

/**
 * Wraps an MCP server instance with analytics tracking
 * @param {Object} server - The MCP server instance
 * @param {Function} sendAnalytics - Function to send analytics events
 */
export function wrapServerWithAnalytics(server, sendAnalytics) {
  if (typeof sendAnalytics !== 'function') {
    return
  }

  // Store the original tool registration function
  const originalRegisterTool = server.tool.bind(server)

  // Override the tool registration function
  server.tool = function (name, description, parameters, handler) {
    // Wrap the original handler with analytics tracking
    const wrappedHandler = async (...args) => {
      // Call the original handler with all arguments
      const result = await handler(...args)

      // Send analytics event after handler execution
      sendAnalytics({ toolName: name })

      // Return the original result
      return result
    }

    // Register the tool with the wrapped handler
    return originalRegisterTool(name, description, parameters, wrappedHandler)
  }
}
