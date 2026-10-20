'use strict'

/**
 * Pure builder for the `webApps` block of the sfcore.analysis.generated.v1
 * analytics event. Consumed by the sf-core framework runner's
 * getAnalysisEventDetails(), like the sandboxes block
 * (`../sandboxes/analytics.js`), whose contract this mirrors:
 *
 *  - Fixed keys and closed vocabularies only — never web app names, entry
 *    paths, hostnames, ARNs or any other user-authored string.
 *  - Explicit-only: a knob is counted only when a web app sets it in
 *    serverless.yml (an explicit value equal to the default IS counted).
 *  - Omit-empty: absent key ≡ 0 ≡ "no web app sets this".
 *  - HARD REQUIREMENT: total function — never throws. Every config read
 *    happens inside the try/catch; a throw escaping into the runner would
 *    abort finalization and drop the billing usage event.
 */

import Esbuild, { isTypeScriptFile } from '../../esbuild/index.js'
import { listDomainEntries } from '../domains/utils.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** `true`, `false`, or the string forms the domains plugin accepts. */
const isFalse = (value) =>
  value !== undefined && ['false', '0'].includes(String(value).toLowerCase())

/** Per-web-app knobs counted when set, each with how to read it. */
const EXPLICIT_KNOBS = {
  timeout: (webApp) => webApp.timeout,
  maxConcurrency: (webApp) => webApp.maxConcurrency,
  maxEnvironments: (webApp) =>
    isObj(webApp.url) ? webApp.url.maxEnvironments : undefined,
  rateLimit: (webApp) => (isObj(webApp.url) ? webApp.url.rateLimit : undefined),
  logs: (webApp) => webApp.logs,
  role: (webApp) => webApp.role,
  vpc: (webApp) => webApp.vpc,
  kmsKeyArn: (webApp) => webApp.kmsKeyArn,
}

/**
 * The fixed-key object of the positive counts, or `undefined` when every
 * count is 0.
 *
 * @param {Record<string, number>} counts
 * @returns {Record<string, number>|undefined}
 */
const positiveCounts = (counts) => {
  const out = {}
  for (const [key, n] of Object.entries(counts)) {
    if (n > 0) out[key] = n
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * How the web app's endpoint is reached: `domain` behind a custom domain
 * (CloudFront signs requests to an IAM endpoint), `aws_iam` for
 * `url.authorizer: aws_iam` (any case), else `public`. Mirrors
 * `getWebAppAuthType` in `compilers/endpoint.js`; validation rejects an authorizer
 * on a web app with a domain.
 */
const urlKindOf = (webApp, behindDomain) => {
  if (behindDomain) return 'domain'
  const authorizer = webApp.url?.authorizer
  return typeof authorizer === 'string' &&
    authorizer.toLowerCase() === 'aws_iam'
    ? 'aws_iam'
    : 'public'
}

/**
 * The enabled `provider.domain(s)` entries with `webApp`, as the domains
 * plugin and the web-app domain validator select them.
 */
const webAppDomainEntriesOf = (provider) =>
  listDomainEntries(isObj(provider) ? provider : {})
    .map(({ config }) => config)
    .filter((entry) => isObj(entry) && entry.webApp != null)
    .filter((entry) => !isFalse(entry.enabled))

/**
 * Runner-facing entry: takes the full service config and returns a spreadable
 * details fragment — `{ webApps: <block> }` when the service defines web apps,
 * `{}` otherwise.
 *
 * @param {object} config - the service configuration
 * @param {string} [serviceDir] - the directory web app entries are relative
 *   to; without it, `bundled` is omitted
 * @returns {{ webApps?: object }}
 */
export const buildWebAppsAnalytics = (config, serviceDir) => {
  try {
    const webApps = config?.webApps
    if (!isObj(webApps)) return {}
    const names = Object.keys(webApps)
    if (names.length === 0) return {}

    const domainEntries = webAppDomainEntriesOf(config.provider)
    const namesBehindDomains = new Set(
      domainEntries.map((entry) => entry.webApp),
    )

    const entryKinds = { ts: 0, js: 0 }
    const url = { public: 0, aws_iam: 0, domain: 0 }
    const explicit = Object.fromEntries(
      Object.keys(EXPLICIT_KNOBS).map((knob) => [knob, 0]),
    )
    let bundled = 0

    // Malformed entries count toward `count` (they exist in config) but
    // contribute nothing else.
    for (const name of names) {
      const webApp = webApps[name]
      if (!isObj(webApp)) continue

      if (typeof webApp.entry === 'string') {
        entryKinds[isTypeScriptFile(webApp.entry) ? 'ts' : 'js'] += 1
      }
      if (
        typeof serviceDir === 'string' &&
        Esbuild.WillEsBuildWebApp(config, serviceDir, webApp)
      ) {
        bundled += 1
      }
      url[urlKindOf(webApp, namesBehindDomains.has(name))] += 1
      for (const [knob, read] of Object.entries(EXPLICIT_KNOBS)) {
        if (read(webApp) != null) explicit[knob] += 1
      }
    }

    const block = { count: names.length }
    const add = (key, value) => {
      if (value !== undefined) block[key] = value
    }
    add('entryKinds', positiveCounts(entryKinds))
    add('bundled', bundled > 0 ? bundled : undefined)
    add('url', positiveCounts(url))
    add('explicit', positiveCounts(explicit))
    add(
      'domains',
      positiveCounts({
        entries: domainEntries.length,
        withCertificateArn: domainEntries.filter(
          (entry) => entry.certificateArn != null,
        ).length,
      }),
    )
    return { webApps: block }
  } catch {
    // Last-resort guard: analytics must never throw into the CLI run.
    return {}
  }
}
