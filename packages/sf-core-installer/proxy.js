// Chooses the proxy for a request URL from the standard proxy environment
// variables, with npm's configuration as a fallback.

const formatHostName = (hostname) => hostname.replace(/^\.*/, '.').toLowerCase()

const parseNoProxyZone = (zone) => {
  zone = zone.trim()
  const zoneParts = zone.split(':', 2)
  const zoneHost = formatHostName(zoneParts[0])
  const zonePort = zoneParts[1]
  const hasPort = zone.indexOf(':') > -1
  return { hostname: zoneHost, port: zonePort, hasPort }
}

const shouldBypassProxy = (requestURL) => {
  const noProxy =
    process.env.NO_PROXY ||
    process.env.no_proxy ||
    process.env.npm_config_noproxy ||
    ''
  if (noProxy === '*') return true
  if (noProxy === '') return false

  const port =
    requestURL.port || (requestURL.protocol === 'https:' ? '443' : '80')
  const hostname = formatHostName(requestURL.hostname)

  // npm exports array-form `noproxy[]=` entries newline-joined
  return noProxy
    .split(/[,\n]/)
    .filter((zone) => zone.trim() !== '')
    .map(parseNoProxyZone)
    .some((noProxyZone) => {
      const isMatchedAt = hostname.indexOf(noProxyZone.hostname)
      const hostnameMatched =
        isMatchedAt > -1 &&
        isMatchedAt === hostname.length - noProxyZone.hostname.length
      if (noProxyZone.hasPort) {
        return port === noProxyZone.port && hostnameMatched
      }
      return hostnameMatched
    })
}

// npm applies the proxy settings from .npmrc to its own downloads but does
// not translate them into HTTP(S)_PROXY for lifecycle scripts — they reach
// this script only as npm_config_* variables, so those serve as fallbacks
// when no proxy environment variables are set. Scheme mapping mirrors npm's
// own (npm-registry-fetch: `httpsProxy || proxy`): `https-proxy` is preferred
// for https requests and `proxy` is the fallback for both schemes.
const getProxyUrl = (url) => {
  const requestURL = new URL(url)

  if (shouldBypassProxy(requestURL)) return null

  if (requestURL.protocol === 'http:') {
    return (
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.npm_config_proxy ||
      null
    )
  }
  if (requestURL.protocol === 'https:') {
    return (
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.npm_config_https_proxy ||
      process.env.npm_config_proxy ||
      null
    )
  }
  return null
}

module.exports = { getProxyUrl }
