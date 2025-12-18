import { ProxyAgent as UndiciProxyAgent } from 'undici'

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

function shouldBypassProxy(url) {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy
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

export { getProxyDispatcher, shouldBypassProxy }
export * from './aws.js'
