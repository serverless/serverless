import os from 'os'

export const isWindows = () => {
  return os.type() === 'Windows_NT'
}

export const fetchWithRetry = async (
  endpoint,
  options,
  attempts = 5,
  delayMs = 5000,
) => {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(endpoint, options)
      // A freshly deployed API Gateway can briefly answer 403/404 while routes
      // propagate — retry on any non-2xx.
      if (response.ok) {
        return response
      }
      // Consume the body so undici releases the connection back to the pool;
      // an unread body keeps the socket open until GC.
      await response.arrayBuffer().catch(() => {})
      lastErr = new Error(`endpoint returned ${response.status}`)
    } catch (err) {
      lastErr = err
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastErr
}
