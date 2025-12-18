import { ProxyManager } from './proxyManager.js'
import { runProxyServer } from './proxy.js'
import { startControlServer } from './servers.js'
import { logRequest } from './utils.js'

/**
 * Main entry point for the local proxy server
 */
async function main() {
  try {
    // Check if custom domain was provided
    if (process.argv.length > 2) {
      logRequest({
        args: [`Using custom domain: ${process.argv[2]}`],
        level: 'info',
      })
    }

    // Initialize proxy manager
    const proxyManager = new ProxyManager()

    // Start both servers
    runProxyServer(proxyManager)
    startControlServer(proxyManager)

    // Handle graceful shutdown
    const shutdown = async () => {
      logRequest({
        args: [`Shutting down servers...`],
        level: 'info',
      })
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } catch (err) {
    logRequest({
      args: [`Failed to start servers: ${err}`],
      level: 'error',
    })
    process.exit(1)
  }
}

// Start the application
main().catch((err) => {
  logRequest({
    args: [`Unhandled error: ${err}`],
    level: 'error',
  })
  process.exit(1)
})
