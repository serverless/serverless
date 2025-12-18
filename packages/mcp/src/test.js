import http from 'http'
import { EventSource } from 'eventsource'

// Global variable to store the session ID obtained from the server.
let sessionId = null

// Map to track pending JSON‑RPC requests by their id.
const pendingRequests = new Map()

/**
 * Opens an SSE connection to the server and waits for the "endpoint" event to obtain the sessionId.
 *
 * @param {Object} args - The configuration object.
 * @param {string} args.url - The SSE endpoint URL.
 * @returns {Promise<EventSource>} Resolves with the EventSource once the sessionId is received.
 */
function startSseClient({ url }) {
  return new Promise((resolve, reject) => {
    const source = new EventSource(url)
    const timeout = setTimeout(() => {
      reject(new Error('Timeout: sessionId not received within expected time.'))
    }, 5000)

    source.addEventListener('endpoint', (event) => {
      try {
        const data = event.data
        const parsedUrl = new URL(data, url)
        sessionId = parsedUrl.searchParams.get('sessionId')
        clearTimeout(timeout)
        resolve(source)
      } catch (err) {
        clearTimeout(timeout)
        reject(err)
      }
    })

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data && data.id && pendingRequests.has(data.id)) {
          const resolver = pendingRequests.get(data.id)
          resolver(data)
          pendingRequests.delete(data.id)
        }
      } catch (err) {
        // Silently fail on parse errors.
      }
    }

    source.onerror = (error) => {
      clearTimeout(timeout)
      reject(error)
    }
  })
}

/**
 * Sends a JSON‑RPC message via HTTP POST.
 * The response is delivered asynchronously over the SSE connection.
 *
 * @param {Object} args - The configuration object.
 * @param {Object} args.messageObj - The JSON‑RPC request object.
 * @param {string} args.hostname - The server hostname.
 * @param {number} args.port - The server port.
 * @returns {Promise<any>} Resolves with the JSON‑RPC response from the SSE.
 */
function sendMcpMessage({ messageObj, hostname, port }) {
  return new Promise((resolve, reject) => {
    if (!sessionId) {
      return reject(new Error('Session ID not set.'))
    }
    pendingRequests.set(messageObj.id, resolve)
    const requestBody = JSON.stringify(messageObj)
    const options = {
      hostname,
      port,
      path: `/messages?sessionId=${sessionId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP Error ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', (err) => reject(err))
    req.end(requestBody)
  })
}

/**
 * Main function that:
 * 1. Establishes an SSE connection.
 * 2. Sends JSON‑RPC messages.
 * 3. Logs responses only on successful calls.
 */
async function main() {
  try {
    const sseUrl = 'http://localhost:3001/sse'
    await startSseClient({ url: sseUrl })
    if (!sessionId) return

    // Build a JSON‑RPC payload to list tools.
    const listToolsPayload = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }

    const listResponse = await sendMcpMessage({
      messageObj: listToolsPayload,
      hostname: 'localhost',
      port: 3001,
    })
    if (listResponse && listResponse.result) {
      console.log('Response: List:', listResponse.result)
    }

    // Build a JSON‑RPC payload to invoke the "info" tool.
    const callToolPayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'info', arguments: {} },
    }

    const callResponse = await sendMcpMessage({
      messageObj: callToolPayload,
      hostname: 'localhost',
      port: 3001,
    })
    if (callResponse && callResponse.result) {
      console.log('Response: Info:', callResponse.result)
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

main()
