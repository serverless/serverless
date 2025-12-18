import { createServer } from 'node:http'
import { logRequest } from './utils.js'

/**
 * Route handler for registering proxies
 * @param {Object} params Configuration object
 * @param {Object} params.proxyManager ProxyManager instance
 * @param {Object} params.req HTTP request object
 * @param {Object} params.res HTTP response object
 */
async function handleRegister({ proxyManager, req, res }) {
  const data = await parseRequestBody(req)

  if (Array.isArray(data)) {
    await proxyManager.addMultiplePaths(data)
  } else {
    await proxyManager.addPath(data)
  }

  sendJson(res, { status: 'ok' })
}

/**
 * Route handler for deregistering proxies
 * @param {Object} params Configuration object
 * @param {Object} params.proxyManager ProxyManager instance
 * @param {Object} params.req HTTP request object
 * @param {Object} params.res HTTP response object
 */
async function handleDeregister({ proxyManager, req, res }) {
  const data = await parseRequestBody(req)
  await proxyManager.removePaths(data.service)
  sendJson(res, { status: 'ok' })
}

/**
 * Route handler for retrieving proxy information
 * @param {Object} params Configuration object
 * @param {Object} params.proxyManager ProxyManager instance
 * @param {Object} params.req HTTP request object
 * @param {Object} params.res HTTP response object
 */
function handleInfo({ proxyManager, req, res }) {
  const response = {
    proxies: proxyManager.getProxies(),
    baseProxy: process.argv[2] || '', // Custom domain from command line
  }
  sendJson(res, response)
}

/**
 * Helper to parse request body
 * @param {Object} req HTTP request object
 * @returns {Promise<Object>} Parsed request body
 */
async function parseRequestBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString())
}

/**
 * Helper to send JSON response
 * @param {Object} res HTTP response object
 * @param {Object} data Data to send
 * @param {number} [status=200] HTTP status code
 */
function sendJson(res, data, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

/**
 * Starts the control plane server for managing proxies
 * @param {Object} proxyManager Instance of ProxyManager
 */
export function startControlServer(proxyManager) {
  const routes = {
    'POST:/register': handleRegister,
    'DELETE:/deregister': handleDeregister,
    'GET:/info': handleInfo,
  }

  const server = createServer(async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const url = new URL(req.url, `http://${req.headers.host}`)
    const routeKey = `${req.method}:${url.pathname}`

    try {
      const handler = routes[routeKey]
      if (handler) {
        await handler({ proxyManager, req, res })
      } else {
        sendJson(res, { error: 'Not Found' }, 404)
      }
    } catch (err) {
      logRequest({
        args: [`Control server error:`, err],
        level: 'error',
      })
      sendJson(res, { error: err.message }, 500)
    }
  })

  // Read the control port from environment variables (default to 3001)
  const controlPort = process.env.CONTROL_PORT
    ? parseInt(process.env.CONTROL_PORT, 10)
    : 3001
  server.listen(controlPort, () => {
    logRequest({
      args: [`Control server listening on port ${controlPort}`],
      level: 'info',
    })
  })
}
