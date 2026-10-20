'use strict'

import { listDomainEntries } from '../../domains/utils.js'
import _ from 'lodash'
import {
  HOSTNAME_LEVEL_KEYS,
  getApiGatewayOnlyFieldMessages,
  getMissingHostnameMessage,
  getWebAppHostname,
  normalizeWebAppBasePath,
} from '../../domains/models/web-app-domain-config.js'

const API_TYPE_KEYS = ['rest', 'http', 'websocket']

const hostnameOf = getWebAppHostname

/** `true`, `false`, or the string forms the domains plugin accepts. */
const isFalse = (value) =>
  value !== undefined && ['false', '0'].includes(String(value).toLowerCase())

/** Hostnames an API Gateway entry claims, including per-API-type entries. */
const apiGatewayHostnamesOf = (config) => {
  const typed = API_TYPE_KEYS.filter((key) => config[key]).map((key) =>
    hostnameOf(config[key]),
  )
  return typed.length > 0 ? typed : [hostnameOf(config)]
}

/**
 * Validate `provider.domain(s)` entries with `webApp` (spec D14). Entries with
 * `enabled: false` are skipped, as the domains plugin skips them, except for
 * the API Gateway-only field check, which the plugin applies to every entry.
 * Returns every message; the caller throws them as one error.
 *
 * @param {object} params
 * @param {string|object} [params.domain] - `provider.domain`
 * @param {Array|object} [params.domains] - `provider.domains`
 * @param {object} [params.webApps] - `webApps` block
 * @returns {string[]}
 */
export function validateWebAppDomains({ domain, domains, webApps = {} }) {
  // Entries that are not objects (a stray `null` or number) name no web app;
  // the domains plugin reports them for API Gateway domains
  const entries = listDomainEntries({ domain, domains }).filter(
    ({ config }) => config !== null && typeof config === 'object',
  )
  const webAppEntries = entries.filter(({ config }) => config.webApp != null)
  if (webAppEntries.length === 0) return []

  const messages = []
  for (const { path, config } of webAppEntries) {
    messages.push(...getApiGatewayOnlyFieldMessages(config, path))
  }

  const enabled = entries.filter(({ config }) => !isFalse(config.enabled))
  const enabledWebAppEntries = enabled.filter(
    ({ config }) => config.webApp != null,
  )
  const webAppNames = Object.keys(webApps)

  const targeted = new Set()
  for (const { path, config } of enabledWebAppEntries) {
    if (typeof config.webApp !== 'string') {
      messages.push(
        `${path}.webApp must be the name of a web app in this service. Web apps: ${webAppNames.join(', ') || 'none'}.`,
      )
    } else if (webAppNames.includes(config.webApp)) {
      targeted.add(config.webApp)
    } else {
      messages.push(
        `${path}.webApp: no web app named "${config.webApp}" in this service. Web apps: ${webAppNames.join(', ') || 'none'}.`,
      )
    }
  }
  for (const name of targeted) {
    if (webApps[name]?.url?.authorizer) {
      messages.push(
        `webApps.${name}.url.authorizer cannot be combined with a custom domain. CloudFront signs requests to the endpoint; authenticate users in your app.`,
      )
    }
  }

  // An entry without a hostname, or with a basePath that is not a path, has
  // nothing for the hostname rules below to check
  const hostnamed = []
  for (const entry of enabledWebAppEntries) {
    // Already reported: its webApp names no web app
    if (typeof entry.config.webApp !== 'string') continue
    const hostname = hostnameOf(entry.config)
    if (typeof hostname !== 'string' || hostname === '') {
      messages.push(getMissingHostnameMessage(entry.path, entry.config))
    } else if (
      entry.config.basePath != null &&
      typeof entry.config.basePath !== 'string'
    ) {
      messages.push(`${entry.path}.basePath must be a path, for example /api.`)
    } else {
      hostnamed.push(entry)
    }
  }

  const apiGatewayHostnames = new Set(
    enabled
      .filter(({ config }) => config.webApp == null)
      .flatMap(({ config }) => apiGatewayHostnamesOf(config)),
  )
  const byHostname = new Map()
  for (const entry of hostnamed) {
    const hostname = hostnameOf(entry.config)
    if (!byHostname.has(hostname)) byHostname.set(hostname, [])
    byHostname.get(hostname).push(entry)
  }

  for (const [hostname, hostEntries] of byHostname) {
    if (apiGatewayHostnames.has(hostname)) {
      messages.push(
        `${hostname} has both API Gateway and web app entries, and a hostname serves either API Gateway APIs or web apps. Use another hostname for the web apps.`,
      )
    }

    // The hostname's certificate and DNS settings come from its entry without
    // basePath, so a basePath entry may only repeat them.
    const root = hostEntries.find(
      ({ config }) => normalizeWebAppBasePath(config.basePath) === undefined,
    )
    if (root) {
      for (const { path, config } of hostEntries) {
        if (normalizeWebAppBasePath(config.basePath) === undefined) continue
        for (const key of HOSTNAME_LEVEL_KEYS) {
          if (
            config[key] !== undefined &&
            !_.isEqual(config[key], root.config[key])
          ) {
            messages.push(
              `${path} (${hostname}) sets ${key} on an entry with basePath; set it on the entry for ${hostname} without basePath.`,
            )
          }
        }
      }
    }

    const seen = new Set()
    const reported = new Set()
    for (const { config } of hostEntries) {
      const basePath = normalizeWebAppBasePath(config.basePath) ?? ''
      if (seen.has(basePath) && !reported.has(basePath)) {
        reported.add(basePath)
        messages.push(
          `provider.domains has two entries for ${hostname} with basePath "${config.basePath ?? '/'}". Give each web app its own basePath.`,
        )
      }
      seen.add(basePath)
    }
    if (!seen.has('')) {
      messages.push(
        `Domain ${hostname} has only basePath entries, so requests to other paths (like /) have no web app to go to. Add an entry for ${hostname} without basePath.`,
      )
    }
  }

  return messages
}
