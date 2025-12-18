import { log, platformEventClient } from '@serverless/util'
import { startSseServer } from '@serverless/mcp/src/server.js'
import { startStdioServer } from '@serverless/mcp/src/stdio-server.js'

/**
 * Runs the MCP Server
 * @param {Object} options - Command options
 * @param {Object} options.options - CLI options
 * @param {Object} options.authenticatedData - Authenticated data
 * @param {string} options.versionFramework - Framework version for telemetry
 */
export default async function commandMcp({
  options,
  authenticatedData,
  versionFramework,
}) {
  const logger = log.get('mcp')

  const sendAnalytics = authenticatedData?.accessKeyV1
    ? async ({ toolName }) => {
        try {
          const event = {
            projectType: 'mcp',
            toolName,
            userId: authenticatedData.userId,
            orgId: authenticatedData.orgId,
          }

          // Add event to batch
          platformEventClient.addToPublishBatch({
            source: 'sfcore.analysis.generated.v1',
            event,
          })

          // Get access key with fallback
          const accessKey =
            authenticatedData?.accessKeyV1 || authenticatedData?.accessKeyV2

          if (accessKey) {
            // Publish events
            await platformEventClient.publishEventBatches({
              accessKey,
              versionFramework,
            })
          } else {
            logger.debug('Skipping analytics publish: No access key available')
          }
        } catch (error) {
          // Never throw from analytics
          logger.debug(`Analytics error: ${error.message}`)
        }
      }
    : async () => {
        // No-op function that never throws
        try {
          logger.debug('Skipping sending analytics: Not authenticated')
        } catch (error) {
          // Suppress any logging errors
        }
      }

  // Get transport type from options (default: sse)
  const transport = options?.transport || 'sse'

  // Get port from options (default: 3001)
  const port = options?.port || 3001

  logger.notice(`Starting MCP Server with ${transport} transport`)

  try {
    let serverInstance

    if (transport === 'sse') {
      logger.notice(`Server will be available at http://localhost:${port}`)
      serverInstance = await startSseServer({ port, sendAnalytics })
    } else if (transport === 'stdio') {
      serverInstance = await startStdioServer({ sendAnalytics })
    } else {
      throw new Error(`Unsupported transport type: ${transport}`)
    }

    // Handle process termination signals to gracefully shut down the server
    const signals = ['SIGINT', 'SIGTERM']
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.notice('Shutting down MCP Server...')
        try {
          await serverInstance.stop()
          logger.success('MCP Server shut down successfully')
        } catch (error) {
          logger.error(`Error shutting down MCP Server: ${error.message}`)
        }
      })
    })

    // Keep the process running until interrupted
    logger.notice('MCP Server is running. Press Ctrl+C to stop.')

    // Use setInterval to keep the event loop active
    const keepAliveInterval = setInterval(() => {
      // This empty function keeps the Node.js event loop active
    }, 1000)

    // Make sure the interval is cleared when the process is terminated
    signals.forEach((signal) => {
      process.on(signal, () => {
        clearInterval(keepAliveInterval)
      })
    })
  } catch (error) {
    logger.error(`Error running MCP Server: ${error.message}`)
    throw error
  }
}
