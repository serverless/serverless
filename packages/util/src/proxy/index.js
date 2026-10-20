import { HttpsProxyAgent } from 'https-proxy-agent'
import { ProxyAgent as UndiciProxyAgent, fetch as undiciFetch } from 'undici'
import { proxyCaFromEnv, proxyUrlsFromEnv } from './aws.js'

function getProxyUrl() {
  return (
    process.env.proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    null
  )
}

function shouldBypassProxy(url, env = process.env) {
  const noProxy = env.NO_PROXY || env.no_proxy
  if (!noProxy) return false

  // Parse the URL to get the hostname
  let hostname
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }

  // Split NO_PROXY by comma and check each pattern
  const patterns = noProxy.split(',').map((p) => p.trim())

  // `*` alone means every host, as in curl and most other tools.
  if (patterns.includes('*')) return true

  for (const pattern of patterns) {
    if (!pattern) continue

    // Remove leading dot if present
    const cleanPattern = pattern.startsWith('.') ? pattern.slice(1) : pattern

    // Exact match
    if (hostname === cleanPattern) {
      return true
    }

    // Domain suffix match (for .example.com patterns)
    if (hostname.endsWith('.' + cleanPattern)) {
      return true
    }

    // Wildcard match for patterns like *.example.com
    if (cleanPattern.startsWith('*')) {
      const suffix = cleanPattern.slice(1) // remove *

      // If suffix doesn't start with dot, add one for proper subdomain matching
      const normalizedSuffix = suffix.startsWith('.') ? suffix : '.' + suffix

      // Check if hostname ends with the suffix (for subdomains)
      if (hostname.endsWith(normalizedSuffix)) {
        return true
      }

      // Also check if hostname exactly matches the suffix without the dot (for the root domain)
      const rootDomain = normalizedSuffix.startsWith('.')
        ? normalizedSuffix.slice(1)
        : normalizedSuffix
      if (hostname === rootDomain) {
        return true
      }
    }
  }

  return false
}

let cachedProxyAgent
let cachedProxyUrl

function getProxyDispatcher(url) {
  const proxy = getProxyUrl()

  // If no proxy is configured, return undefined
  if (!proxy) return undefined

  // If the URL should bypass proxy according to NO_PROXY, return undefined
  if (url && shouldBypassProxy(url)) {
    return undefined
  }

  // Use cached agent if proxy URL hasn't changed
  if (cachedProxyAgent && cachedProxyUrl === proxy) {
    return cachedProxyAgent
  }

  // Create new undici ProxyAgent
  cachedProxyAgent = new UndiciProxyAgent(proxy)
  cachedProxyUrl = proxy
  return cachedProxyAgent
}

/**
 * A Node.js agent that tunnels a TLS connection (an `https:` or `wss:` URL) through the proxy, for
 * clients that take an `agent` rather than an undici dispatcher, such as WebSocket clients; or
 * undefined when no proxy is set or NO_PROXY covers the URL's host. It chooses the proxy and the
 * proxy's CA as addProxyToAwsClient does for an HTTPS endpoint (HTTPS_PROXY, else HTTP_PROXY, else
 * a generic `proxy`), read from `env` (the process environment by default). `agentOptions` go to
 * the agent and its connection to the proxy (for example a `signal` that ends that connection).
 */
function getProxyAgent(url, { env = process.env, agentOptions } = {}) {
  const { httpProxy, httpsProxy } = proxyUrlsFromEnv(env)
  const proxy = httpsProxy || httpProxy
  if (!proxy || shouldBypassProxy(url, env)) return undefined
  // These options apply to the connection to the proxy only; the tunnelled connection keeps its own.
  const ca = proxyCaFromEnv(env)
  return new HttpsProxyAgent(proxy, {
    ...(ca.length > 0 ? { ca } : {}),
    rejectUnauthorized: true,
    ...agentOptions,
  })
}

/**
 * fetch() of a URL (a string or a URL object) through the proxy the environment sets, or straight
 * to the host when there is none or NO_PROXY covers it. Through a proxy it uses the fetch() of the undici the ProxyAgent comes from,
 * never the global fetch(): the global fetch() runs on the undici that Node.js bundles, and a
 * ProxyAgent from a different undici major is not compatible with it (Node.js 26, which bundles
 * undici 8, rejects a ProxyAgent from undici 6 with "invalid onError method"). That is also why
 * the dispatcher itself is not exported.
 */
function fetchWithProxy(url, init = {}) {
  const dispatcher = getProxyDispatcher(String(url))
  if (!dispatcher) return fetch(url, init)
  return undiciFetch(url, { ...init, dispatcher })
}

export { fetchWithProxy, getProxyAgent, shouldBypassProxy }
export * from './aws.js'
