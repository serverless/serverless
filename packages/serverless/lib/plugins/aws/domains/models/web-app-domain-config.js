/**
 * A `provider.domain(s)` entry with `webApp`: a hostname (and optional
 * `basePath`) served by a web app through a CloudFront distribution. Kept
 * apart from `DomainConfig`, whose API Gateway rules (a required `apiType`,
 * base path mapping normalisation, endpoint types) do not apply.
 */

import { ServerlessError } from '@serverless/util'
import DomainConfig from './domain-config.js'
import { evaluateBoolean } from '../utils.js'

/** Keys that only mean something for API Gateway custom domains. */
export const API_GATEWAY_ONLY_KEYS = [
  'apiType',
  'endpointType',
  'securityPolicy',
  'accessMode',
  'allowPathMatching',
  'preserveExternalPathMappings',
  'autoDomain',
  'autoDomainWaitFor',
  'tlsTruststoreUri',
  'tlsTruststoreVersion',
  'rest',
  'http',
  'websocket',
]

/**
 * One message per API Gateway-only key set on a web-app entry.
 *
 * @param {object} config - the domain entry
 * @param {string} path - the entry's config path, e.g. `provider.domains[1]`
 * @returns {string[]}
 */
export function getApiGatewayOnlyFieldMessages(config, path) {
  return API_GATEWAY_ONLY_KEYS.filter((key) => config[key] !== undefined).map(
    (key) =>
      `${path}.${key} applies to API Gateway domains only. Remove it from entries with webApp.`,
  )
}

/**
 * The message for an enabled web-app entry without a hostname, which has no
 * domain to serve the web app on.
 *
 * @param {string} path - the entry's config path, e.g. `provider.domains[1]`
 * @param {object} config - the domain entry
 * @returns {string}
 */
export function getMissingHostnameMessage(path, config) {
  return `${path} (webApp: ${config.webApp}) needs a hostname. Set name to the domain to serve it on.`
}

/**
 * What `remove` leaves in place when it skips an invalid web-app entry: the
 * Route 53 alias records, which the Framework manages outside the stack and
 * finds by the entry's hostname.
 *
 * @param {object} config - the domain entry
 * @returns {string}
 */
export function getUnremovedRecordsMessage(config) {
  const hostname = getWebAppHostname(config)
  return `Its Route 53 records${typeof hostname === 'string' && hostname !== '' ? ` for ${hostname}` : ''}, if the last deploy created any, may not be removed.`
}

/**
 * Keys that configure a hostname as a whole (its certificate and DNS records),
 * read from the hostname's entry without `basePath`.
 */
export const HOSTNAME_LEVEL_KEYS = [
  'certificateArn',
  'certificateName',
  'createRoute53Record',
  'createRoute53IPv6Record',
  'route53Profile',
  'route53Region',
  'route53Params',
  'hostedZoneId',
  'hostedZonePrivate',
  'splitHorizonDns',
]

/**
 * A domain entry's hostname, lower-cased: DNS names are case-insensitive, so
 * entries that differ only in case share one distribution.
 *
 * @param {object} config - the domain entry
 * @returns {string|undefined}
 */
export function getWebAppHostname(config) {
  const hostname = config.name || config.domainName
  return typeof hostname === 'string' ? hostname.toLowerCase() : hostname
}

/**
 * `basePath` without leading or trailing slashes; `undefined` when the entry
 * has none, which makes it the hostname's default route. The path reaches the
 * web app unchanged.
 *
 * @param {string} [basePath]
 * @returns {string|undefined}
 */
export function normalizeWebAppBasePath(basePath) {
  if (typeof basePath !== 'string') return undefined
  return basePath.trim().replace(/^\/+|\/+$/g, '') || undefined
}

class WebAppDomainConfig {
  /**
   * @param {object} config - the domain entry
   * @param {string} [path] - the entry's config path, for error messages
   */
  constructor(config, path = 'provider.domains') {
    const messages = getApiGatewayOnlyFieldMessages(config, path)
    if (messages.length > 0) {
      throw new ServerlessError(
        messages.join('\n'),
        'WEB_APPS_DOMAIN_API_GATEWAY_FIELD',
        { stack: false },
      )
    }

    this.configPath = path
    this.name = getWebAppHostname(config)
    this.basePath = normalizeWebAppBasePath(config.basePath)
    this.webApp = config.webApp
    this.certificateArn = config.certificateArn
    this.certificateName = config.certificateName
    this.createRoute53Record = evaluateBoolean(config.createRoute53Record, true)
    this.createRoute53IPv6Record = evaluateBoolean(
      config.createRoute53IPv6Record,
      true,
    )
    this.route53Profile = config.route53Profile
    this.route53Region = config.route53Region
    this.hostedZoneId = config.hostedZoneId
    this.hostedZonePrivate = config.hostedZonePrivate
    this.splitHorizonDns =
      !this.hostedZoneId &&
      !this.hostedZonePrivate &&
      evaluateBoolean(config.splitHorizonDns, false)
    this.route53Params = DomainConfig._getRoute53Params(config.route53Params)
    this.enabled = evaluateBoolean(config.enabled, true)
  }

  /**
   * The entry, read. An invalid one is an error by default; with `warn`, used
   * by the commands that only read the entries (`info`, `invoke`, `remove`, so
   * a stack can always be removed), it is skipped instead: `warn` gets the
   * message followed by `Skipping it.` (`Skipping <path>.` when the message
   * does not name the entry) and the result is empty. Any error counts, so an
   * entry shape nothing validated (`configValidationMode: off`) cannot stop
   * those commands either.
   *
   * @param {object} config - the domain entry
   * @param {string} path - the entry's config path, e.g. `provider.domains[1]`
   * @param {object} [options]
   * @param {(message: string) => void} [options.warn]
   * @returns {WebAppDomainConfig[]}
   */
  static read(config, path, { warn } = {}) {
    try {
      return [new WebAppDomainConfig(config, path)]
    } catch (error) {
      if (!warn) throw error
      const message =
        error instanceof ServerlessError
          ? error.message
          : `${path} could not be read (${error.message})`
      const sentence = message.endsWith('.') ? message : `${message}.`
      warn(
        message.startsWith(path)
          ? `${sentence} Skipping it.`
          : `${sentence} Skipping ${path}.`,
      )
      return []
    }
  }

  /**
   * The entries that have a hostname. An enabled entry without one has no
   * domain to serve its web app on: by default that is an error, the one the
   * web-apps validation reports at package time. With `warn`, used by the
   * commands that only read the entries (`info`, `invoke`, `remove`, so a
   * stack can always be removed), the entry is skipped with that message as
   * a warning.
   *
   * @param {WebAppDomainConfig[]} domains
   * @param {object} [options]
   * @param {(message: string) => void} [options.warn]
   * @returns {WebAppDomainConfig[]}
   */
  static withHostnames(domains, { warn } = {}) {
    return domains.filter((domain) => {
      if (typeof domain.name === 'string' && domain.name !== '') return true
      const message = getMissingHostnameMessage(domain.configPath, domain)
      if (!warn) {
        throw new ServerlessError(message, 'WEB_APPS_VALIDATION_ERROR', {
          stack: false,
        })
      }
      warn(`${message} Skipping it.`)
      return false
    })
  }

  /** The hostname, under the name the ACM and Route 53 wrappers read. */
  get givenDomainName() {
    return this.name
  }

  /**
   * One entry per hostname, which carries the hostname's certificate and DNS
   * settings: its entry without `basePath` (validation requires one), else
   * its first entry.
   *
   * @param {WebAppDomainConfig[]} domains
   * @returns {WebAppDomainConfig[]}
   */
  static perHostname(domains) {
    const byHostname = new Map()
    for (const domain of domains) {
      const current = byHostname.get(domain.name)
      if (!current || (current.basePath && !domain.basePath)) {
        byHostname.set(domain.name, domain)
      }
    }
    return [...byHostname.values()]
  }
}

export default WebAppDomainConfig
