import fs from 'fs'
import { addProxyToClient as baseAddProxyToClient } from 'aws-sdk-v3-proxy'
import { log } from '../logger/index.js'
import { shouldBypassProxy } from './index.js'

const logger = log.get('utils:proxy:aws')

/**
 * Check if AWS service endpoints would bypass the proxy based on NO_PROXY
 * Uses the existing shouldBypassProxy function to properly respect NO_PROXY environment variable
 *
 * WHY THIS APPROACH:
 * The ideal solution would be to check each actual AWS endpoint URL at request time against NO_PROXY.
 * However, this is impossible because:
 * 1. We must decide whether to configure proxy support at CLIENT CREATION time
 * 2. The actual endpoint URL is not known until request time
 * 3. Neither hpagent nor proxy-agent support per-request NO_PROXY checking
 * 4. Once a proxy agent is attached to a client, ALL requests go through it
 *
 * Therefore, we test representative AWS endpoints to make a one-time decision:
 * - If ALL test endpoints would bypass proxy → skip proxy setup entirely
 * - If ANY test endpoint would use proxy → configure proxy for all requests
 *
 * WHAT THIS HANDLES WELL (99% of real-world cases):
 * ✓ NO_PROXY=.amazonaws.com → All AWS services bypass proxy
 * ✓ NO_PROXY=localhost,127.0.0.1 → All AWS services use proxy
 * ✓ NO_PROXY=*.internal.company.com → All AWS services use proxy
 *
 * EDGE CASE NOT SUPPORTED:
 * ✗ Selective proxy per AWS service (e.g., "proxy STS but not S3")
 *   This would require per-request NO_PROXY checking, which no Node.js proxy agent
 *   currently supports for AWS SDK v3.
 *
 * This is a pragmatic compromise that solves the reported customer issue where
 * NO_PROXY was completely ignored, causing proxy failures for all AWS requests.
 *
 * @returns {boolean} - True if AWS endpoints should bypass proxy
 */
function shouldAwsEndpointsBypassProxy() {
  // Test with representative AWS service endpoints
  // Most AWS services follow the pattern: service.region.amazonaws.com
  // NOTE: These hardcoded URLs look suspicious but are necessary - see function comment above
  const testUrls = [
    'https://sts.us-east-1.amazonaws.com', // STS (used for credential validation)
    'https://s3.amazonaws.com', // S3 global endpoint
    'https://s3.us-east-1.amazonaws.com', // S3 regional endpoint (different pattern!)
    'https://cloudformation.us-east-1.amazonaws.com', // CloudFormation (stack operations)
    'https://ssm.us-east-1.amazonaws.com', // SSM (parameter store for variables)
  ]

  // If ALL of these would bypass per NO_PROXY rules, then AWS endpoints generally bypass
  // shouldBypassProxy returns true when the URL matches NO_PROXY patterns
  return testUrls.every((url) => shouldBypassProxy(url))
}

function firstEnv(...names) {
  for (const name of names) {
    const val = process.env[name]
    if (val && String(val).trim() !== '') return String(val).trim()
  }
  return undefined
}

function buildAgentOptionsFromEnv(existingAgentOptions = {}) {
  const agentOptions = { ...existingAgentOptions }
  const proxyOpts = (agentOptions.proxyRequestOptions =
    agentOptions.proxyRequestOptions || {})

  // Collect proxy CA values from env
  const proxyCaValues = []
  const caEnv = firstEnv('ca', 'HTTPS_CA', 'https_ca')
  if (caEnv) proxyCaValues.push(caEnv)

  const cafilePath = firstEnv('cafile', 'HTTPS_CAFILE', 'https_cafile')
  if (cafilePath) {
    try {
      proxyCaValues.push(fs.readFileSync(cafilePath, 'utf8'))
    } catch (err) {
      // Log at debug level but do not throw
      logger.debug(
        'Failed to read cafile at %s: %s',
        cafilePath,
        err?.message || err,
      )
    }
  }

  // Apply env-provided CA to the proxy TLS handshake only
  if (proxyCaValues.length > 0) {
    const existingProxyCa = proxyOpts.ca
    proxyOpts.ca = Array.isArray(existingProxyCa)
      ? [...existingProxyCa, ...proxyCaValues]
      : [...proxyCaValues]
  }

  // Enforce TLS validation by default for proxy handshake
  if (proxyOpts.rejectUnauthorized === undefined)
    proxyOpts.rejectUnauthorized = true

  return agentOptions
}

function buildProxyOptionsFromEnv(overrides = {}) {
  // Prefer explicit overrides when provided
  let {
    httpProxy,
    httpsProxy,
    agentOptions,
    httpsOnly,
    throwOnNoProxy,
    debug,
    ...rest
  } = overrides

  // Determine proxy URLs from env when not provided explicitly
  if (!httpProxy && !httpsProxy) {
    const httpEnv = firstEnv('HTTP_PROXY', 'http_proxy')
    const httpsEnv = firstEnv('HTTPS_PROXY', 'https_proxy')
    const generic = firstEnv('proxy')
    httpProxy = httpProxy || httpEnv
    httpsProxy = httpsProxy || httpsEnv
    if (!httpProxy && !httpsProxy && generic) {
      // Route based on scheme when only a generic proxy is provided
      if (/^https:/i.test(generic)) httpsProxy = generic
      else httpProxy = generic
    }
  }

  const mergedAgentOptions = buildAgentOptionsFromEnv(agentOptions)
  const opts = { agentOptions: mergedAgentOptions, ...rest }
  if (typeof httpsOnly === 'boolean') opts.httpsOnly = httpsOnly
  if (typeof throwOnNoProxy === 'boolean') opts.throwOnNoProxy = throwOnNoProxy
  else opts.throwOnNoProxy = false
  if (typeof debug === 'boolean') opts.debug = debug

  // Apply timeouts from env if provided and not explicitly overridden
  const timeoutEnv =
    process.env.AWS_CLIENT_TIMEOUT || process.env.aws_client_timeout
  const timeoutMs = timeoutEnv ? parseInt(timeoutEnv, 10) : undefined
  if (Number.isFinite(timeoutMs)) {
    if (opts.connectionTimeout === undefined) opts.connectionTimeout = timeoutMs
    if (opts.socketTimeout === undefined) opts.socketTimeout = timeoutMs
  }

  if (httpProxy) opts.httpProxy = httpProxy
  if (httpsProxy) opts.httpsProxy = httpsProxy
  return opts
}

/**
 * Adds proxy (and optional CA/cafile) support to an AWS SDK v3 client using aws-sdk-v3-proxy,
 * while honoring additional environment variables:
 * - proxy, HTTP_PROXY, http_proxy, HTTPS_PROXY, https_proxy
 * - NO_PROXY, no_proxy (bypasses proxy for matching hosts)
 * - ca, HTTPS_CA, https_ca (PEM content)
 * - cafile, HTTPS_CAFILE, https_cafile (path to PEM file)
 *
 * @template T
 * @param {T} client - An instance of an AWS SDK v3 client
 * @param {object} [options] - Optional overrides passed to aws-sdk-v3-proxy
 * @returns {T} The same client, enhanced with proxy support if applicable
 */
export function addProxyToAwsClient(client, options = {}) {
  // Check if AWS endpoints should bypass the proxy based on NO_PROXY
  // Note: shouldBypassProxy only returns true when NO_PROXY patterns actually match,
  // not when there's simply no proxy configured
  if (shouldAwsEndpointsBypassProxy()) {
    logger.debug(
      'AWS endpoints match NO_PROXY patterns, skipping proxy configuration',
    )
    return client
  }

  const mergedOptions = buildProxyOptionsFromEnv(options)
  return baseAddProxyToClient(client, mergedOptions)
}
