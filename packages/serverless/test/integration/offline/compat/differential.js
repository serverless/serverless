// Opt-in differential drift-detector (a plain node script, NOT a jest test).
//
//   cd packages/serverless && node test/integration/offline/compat/differential.js
//   (or: npm run test:offline:compat)
//
// For a focused set of fixtures it boots BOTH our built-in `sls offline`
// (bootOffline) and the community serverless-offline plugin (bootCommunityPlugin),
// sends identical request(s) to each, captures the response (status, key
// headers, body) and — where the handler echoes the event — the handler-received
// event, then deep-diffs the two. Diffs that match a recorded {surface, field}
// in the divergence allowlist (compat/divergences.js) are expected and filtered
// out; anything left is an UNEXPECTED drift.
//
// Exit 0 when no unexpected diff remains, non-zero otherwise. All child
// processes and temp dirs are torn down on every path (success, diff, or error)
// and every boot is bounded by the helper readiness deadlines.
//
// Requires the community plugin checked out locally (SERVERLESS_OFFLINE_DIR, or
// the default sibling path); it is skipped automatically if absent.

import { spawn } from 'node:child_process'
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import yaml from 'js-yaml'

import { bootOffline } from '../_harness.js'
import { bootCommunityPlugin } from '../_capture.js'
import { freePort, twoFreePorts } from '../_ports.js'
import { isAllowed } from './divergences.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.resolve(__dirname, '../fixtures')
const SF_CORE = path.resolve(__dirname, '../../../../../sf-core/bin/sf-core.js')
// Local `serverless-offline` checkout to diff against. Set SERVERLESS_OFFLINE_DIR
// to a clone to enable the drift-detector; unset makes this script skip cleanly.
const PLUGIN_DIR = process.env.SERVERLESS_OFFLINE_DIR

// Header names worth diffing per surface. Volatile/transport headers (date,
// connection, content-length, etc.) and request-id-style values are ignored —
// they are never AWS-contract-meaningful and would be pure noise.
const KEY_HEADERS = [
  'content-type',
  'x-amzn-errortype',
  'x-amz-executed-version',
  'x-amz-function-error',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'x-echo',
]

// Event fields that are inherently per-request random (ids, timestamps, source
// ip/port, ephemeral host:port) and must be normalized before diffing so they
// don't masquerade as behavioral drift.
const VOLATILE_EVENT_PATHS = new Set([
  'requestContext.requestId',
  'requestContext.extendedRequestId',
  'requestContext.requestTimeEpoch',
  'requestContext.requestTime',
  'requestContext.identity.sourceIp',
  'requestContext.identity',
  'requestContext.domainName',
  'requestContext.domainPrefix',
  'requestContext.apiId',
  'requestContext.accountId',
  'requestContext.elb',
  'headers.host',
  'headers.x-forwarded-for',
  'headers.x-forwarded-port',
  'headers.x-amzn-trace-id',
  'multiValueHeaders.host',
  'multiValueHeaders.x-forwarded-for',
  'multiValueHeaders.x-forwarded-port',
  'requestContext.time',
  'requestContext.timeEpoch',
  'id',
  // The error envelope's stack trace is environment-specific (file paths,
  // internal frames) — never a behavioral divergence. Both sides return the
  // same { errorMessage, errorType, trace } envelope shape.
  'trace',
])

/**
 * Collect the response into a comparable shape: status, the curated key
 * headers, and the parsed (or raw) body.
 *
 * @param {Response} res
 * @returns {Promise<{ status: number, headers: Record<string,string|null>, body: unknown }>}
 */
async function snapshot(res) {
  const headers = {}
  for (const h of KEY_HEADERS) headers[h] = res.headers.get(h)
  const text = await res.text()
  let body = text
  try {
    body = JSON.parse(text)
  } catch {
    // keep the raw text body
  }
  return { status: res.status, headers, body }
}

/**
 * Recursively flatten an object into dotted-path → value pairs, so two events
 * can be compared field-by-field. Arrays are compared as whole values.
 *
 * @param {unknown} value
 * @param {string} [prefix]
 * @param {Record<string, unknown>} [out]
 * @returns {Record<string, unknown>}
 */
function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out)
    }
  } else {
    out[prefix] = value
  }
  return out
}

/**
 * Diff two snapshots, returning a list of { field, ours, plugin } drifts. The
 * status, each key header, and (when both bodies parsed to objects) each event
 * field are compared. Volatile event paths are dropped first.
 *
 * @param {{ status: number, headers: object, body: unknown }} ours
 * @param {{ status: number, headers: object, body: unknown }} plugin
 * @returns {{ field: string, ours: unknown, plugin: unknown }[]}
 */
function diffSnapshots(ours, plugin) {
  const diffs = []
  if (ours.status !== plugin.status) {
    diffs.push({ field: 'status', ours: ours.status, plugin: plugin.status })
  }
  for (const h of KEY_HEADERS) {
    const a = ours.headers[h]
    const b = plugin.headers[h]
    if (norm(a) !== norm(b)) {
      diffs.push({ field: `headers.${h}`, ours: a, plugin: b })
    }
  }
  const bothObjects =
    ours.body &&
    plugin.body &&
    typeof ours.body === 'object' &&
    typeof plugin.body === 'object'
  if (bothObjects) {
    const a = flatten(ours.body)
    const b = flatten(plugin.body)
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      if (isVolatile(key)) continue
      const av = JSON.stringify(a[key])
      const bv = JSON.stringify(b[key])
      if (av !== bv) diffs.push({ field: key, ours: a[key], plugin: b[key] })
    }
  } else if (JSON.stringify(ours.body) !== JSON.stringify(plugin.body)) {
    diffs.push({ field: 'body', ours: ours.body, plugin: plugin.body })
  }
  return diffs
}

/** Case-insensitive header comparison; null and undefined both mean absent. */
function norm(v) {
  return v == null ? null : String(v).toLowerCase()
}

/** Whether a flattened field path is volatile (a path itself or a child of one). */
function isVolatile(key) {
  if (VOLATILE_EVENT_PATHS.has(key)) return true
  for (const p of VOLATILE_EVENT_PATHS) {
    if (key.startsWith(`${p}.`)) return true
  }
  return false
}

/**
 * Boot the community plugin against a fixture, pinning extra event-server ports
 * (albPort / websocketPort) the simple bootCommunityPlugin helper does not. Used
 * for the ALB surface, whose plugin server binds a separate albPort. Returns the
 * same helper shape plus the temp dir, with a stop() that kills + cleans up.
 *
 * @param {{ fixtureDir: string, extraConfig?: object, readyMs?: number }} opts
 */
async function bootCommunityWithPorts({
  fixtureDir,
  extraConfig = {},
  readyMs = 90_000,
}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'so-diff-'))
  await cp(fixtureDir, dir, { recursive: true })
  const [httpPort, lambdaPort] = await twoFreePorts()
  let albPort = await freePort()
  while (albPort === httpPort || albPort === lambdaPort)
    albPort = await freePort()

  const ymlPath = path.join(dir, 'serverless.yml')
  const doc = yaml.load(await readFile(ymlPath, 'utf8')) ?? {}
  doc.plugins = [...(doc.plugins ?? []), 'serverless-offline']
  doc.custom = { ...(doc.custom ?? {}) }
  doc.custom['serverless-offline'] = {
    ...(doc.custom['serverless-offline'] ?? {}),
    httpPort,
    lambdaPort,
    albPort,
    ...extraConfig,
  }
  await writeFile(ymlPath, yaml.dump(doc))
  await mkdir(path.join(dir, 'node_modules'), { recursive: true })
  await symlink(
    PLUGIN_DIR,
    path.join(dir, 'node_modules', 'serverless-offline'),
    'dir',
  )

  const child = spawn('node', [SF_CORE, 'offline'], {
    cwd: dir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout.on('data', (d) => (out += d.toString()))
  child.stderr.on('data', (d) => (out += d.toString()))

  async function stop() {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGINT')
      const limit = Date.now() + 5000
      while (
        child.exitCode === null &&
        child.signalCode === null &&
        Date.now() < limit
      )
        await delay(100)
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL')
    }
    await rm(dir, { recursive: true, force: true })
  }

  // A fixture with no HTTP/REST/ALB/WebSocket routes (e.g. lambda-invoke) never
  // prints "Server ready" — only the lambda endpoint line. Treat the lambda
  // endpoint as a readiness signal too, and parse both bound ports.
  const deadline = Date.now() + readyMs
  let httpBound, lambdaBound
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      await rm(dir, { recursive: true, force: true })
      throw new Error(`plugin exited:\n${out}`)
    }
    const h = out.match(/Server ready:\s*http:\/\/[^:\s]+:(\d+)/i)
    const l = out.match(
      /\[http for lambda\]\s+listening on\s+http:\/\/[^:\s]+:(\d+)/i,
    )
    if (h) httpBound = h[1]
    if (l) lambdaBound = l[1]
    if (/Server ready/i.test(out) && httpBound) break
    // No HTTP routes: the lambda endpoint line is the readiness signal.
    if (lambdaBound && !httpBound) {
      // Give the lambda server a beat to finish binding before driving it.
      await delay(250)
      break
    }
    await delay(250)
  }
  if (!httpBound && !lambdaBound) {
    await stop()
    throw new Error(`community plugin did not become ready:\n${out}`)
  }
  return {
    dir,
    httpUrl: httpBound ? `http://localhost:${httpBound}` : undefined,
    lambdaUrl: lambdaBound ? `http://localhost:${lambdaBound}` : undefined,
    albUrl: `http://localhost:${albPort}`,
    logs: () => out,
    stop,
  }
}

// --- Focused surfaces -------------------------------------------------------
// Each surface boots ours + the plugin, runs one or more request `cases`, and
// snapshots both sides. A `case` returns { name, ours, plugin } snapshots.

/** REST API v1: proxy event echo + CORS preflight. */
async function runRest() {
  const fixtureDir = path.join(FIXTURES, 'rest-velocity')
  const ours = await bootOffline({ cwd: fixtureDir })
  const plugin = await bootCommunityPlugin({ fixtureDir })
  try {
    const cases = []
    // Proxy event shape (handler echoes the event).
    {
      const p = '/dev/items/42?q=1&q=2&single=x'
      const init = {
        method: 'GET',
        headers: { 'x-test': 'abc', accept: 'application/json' },
      }
      cases.push({
        name: 'proxy-event',
        ours: await snapshot(await ours.http(p, init)),
        plugin: await snapshot(await fetch(`${plugin.httpUrl}${p}`, init)),
      })
    }
    // CORS preflight (response headers).
    {
      const p = '/dev/items/42'
      const init = {
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'content-type',
        },
      }
      cases.push({
        name: 'cors-preflight',
        ours: await snapshot(await ours.http(p, init)),
        plugin: await snapshot(await fetch(`${plugin.httpUrl}${p}`, init)),
      })
    }
    return cases
  } finally {
    await ours.stop()
    await plugin.stop()
  }
}

/** HTTP API v2: proxy event echo. Expected to be byte-parity. */
async function runHttpApi() {
  const fixtureDir = path.join(FIXTURES, 'http-api')
  const ours = await bootOffline({ cwd: fixtureDir })
  const plugin = await bootCommunityPlugin({ fixtureDir })
  try {
    const p = '/echo?q=1'
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test': 'abc' },
      body: JSON.stringify({ hello: 'world' }),
    }
    return [
      {
        name: 'v2-event',
        ours: await snapshot(await ours.http(p, init)),
        plugin: await snapshot(await fetch(`${plugin.httpUrl}${p}`, init)),
      },
    ]
  } finally {
    await ours.stop()
    await plugin.stop()
  }
}

/** ALB: single-value event echo. The plugin binds a separate albPort. */
async function runAlb() {
  const fixtureDir = path.join(FIXTURES, 'alb')
  const ours = await bootOffline({ cwd: fixtureDir })
  // The plugin's ALB server crashes marshalling a response that carries a
  // `headers` object, so swap in a minimal echo handler for the plugin boot
  // (the echoed body is the ALB EVENT — all we diff here). Our offline keeps
  // the full handler; the response-headers crash is itself an allowlisted
  // divergence (alb / response.headers).
  const pluginFixture = await mkdtemp(path.join(tmpdir(), 'so-alb-src-'))
  await cp(fixtureDir, pluginFixture, { recursive: true })
  await writeFile(
    path.join(pluginFixture, 'handler.js'),
    "'use strict'\nexports.echo = async (event) => ({ statusCode: 200, body: JSON.stringify(event) })\n",
  )
  const plugin = await bootCommunityWithPorts({ fixtureDir: pluginFixture })
  try {
    const init = {
      method: 'GET',
      headers: { 'x-test': 'abc', accept: 'application/json' },
    }
    const query = '?q=a&q=b&single=x'
    // Our offline serves the stage-less ALB path; the plugin prepends the stage
    // (an allowlisted urlStagePrefix divergence) so the plugin is hit at /dev/.
    return [
      {
        name: 'single-value-event',
        ours: await snapshot(await ours.http(`/single${query}`, init)),
        plugin: await snapshot(
          await fetch(`${plugin.albUrl}/dev/single${query}`, init),
        ),
      },
    ]
  } finally {
    await ours.stop()
    await plugin.stop()
    await rm(pluginFixture, { recursive: true, force: true })
  }
}

/** REST authorizers: rejection envelopes + an Allow path. */
async function runAuthorizers() {
  const fixtureDir = path.join(FIXTURES, 'authorizers/rest')
  const ours = await bootOffline({ cwd: fixtureDir })
  const plugin = await bootCommunityPlugin({ fixtureDir })
  try {
    const cases = []
    const reqs = [
      // TOKEN authorizer, no token → 401 rejection envelope.
      { name: 'token-401', p: '/dev/token', init: {} },
      // TOKEN authorizer, Deny policy → 403 rejection envelope.
      {
        name: 'token-403',
        p: '/dev/token',
        init: { headers: { Authorization: 'this-is-not-allow-me' } },
      },
      // IAM route — runs unauthenticated locally; authorizer block differs.
      { name: 'iam-allow', p: '/dev/iam', init: {} },
    ]
    for (const { name, p, init } of reqs) {
      cases.push({
        name,
        ours: await snapshot(await ours.http(p, init)),
        plugin: await snapshot(await fetch(`${plugin.httpUrl}${p}`, init)),
      })
    }
    return cases
  } finally {
    await ours.stop()
    await plugin.stop()
  }
}

/** Lambda invoke: sync return, error envelope, and DryRun. */
async function runInvoke() {
  const fixtureDir = path.join(FIXTURES, 'lambda-invoke')
  const service = 'it-lambda-invoke'
  const worker = `${service}-dev-worker`
  const thrower = `${service}-dev-thrower`
  const ours = await bootOffline({ cwd: fixtureDir })
  // lambda-invoke has no HTTP routes, so the plugin only prints the lambda
  // endpoint line — bootCommunityWithPorts treats that as readiness.
  const plugin = await bootCommunityWithPorts({ fixtureDir })
  const invoke = (base, name, { headers = {}, body } = {}) =>
    fetch(`${base}/2015-03-31/functions/${name}/invocations`, {
      method: 'POST',
      headers,
      body: body === undefined ? '' : JSON.stringify(body),
    })
  try {
    const cases = []
    // Sync RequestResponse — body parity + X-Amz-Executed-Version drift.
    cases.push({
      name: 'sync',
      ours: await snapshot(
        await invoke(ours.lambdaUrl, worker, { body: { hello: 'world' } }),
      ),
      plugin: await snapshot(
        await invoke(plugin.lambdaUrl, worker, { body: { hello: 'world' } }),
      ),
    })
    // Handler error — Unhandled envelope.
    cases.push({
      name: 'error',
      ours: await snapshot(await invoke(ours.lambdaUrl, thrower, { body: {} })),
      plugin: await snapshot(
        await invoke(plugin.lambdaUrl, thrower, { body: {} }),
      ),
    })
    // DryRun — 204 (ours) vs 400 (plugin) status drift.
    cases.push({
      name: 'dry-run',
      ours: await snapshot(
        await invoke(ours.lambdaUrl, worker, {
          headers: { 'x-amz-invocation-type': 'DryRun' },
          body: {},
        }),
      ),
      plugin: await snapshot(
        await invoke(plugin.lambdaUrl, worker, {
          headers: { 'x-amz-invocation-type': 'DryRun' },
          body: {},
        }),
      ),
    })
    return cases
  } finally {
    await ours.stop()
    await plugin.stop()
  }
}

// Map differential field names onto allowlist {surface, field} keys. Most diffs
// surface under the same field path the allowlist records; a handful of header
// and status diffs need a small alias so the same drift matches its entry.
const FIELD_ALIASES = {
  alb: {
    // The echoed ALB event.path differs only because the plugin prepends the
    // stage to the served URL — the recorded urlStagePrefix divergence.
    path: 'urlStagePrefix',
  },
  invoke: {
    status: 'dryRunStatus', // the only status drift on the invoke surface is DryRun
  },
  authorizers: {
    'requestContext.authorizer.principalId': 'requestContext.authorizer',
  },
}

/**
 * Resolve a raw diff field to the allowlist field for its surface (applying any
 * alias), then test membership.
 *
 * @param {string} surface
 * @param {{ field: string }} diff
 * @param {{ name: string, ours: { status: number } }} testCase
 */
function diffAllowed(surface, diff, testCase) {
  const alias = FIELD_ALIASES[surface]?.[diff.field] ?? diff.field
  if (isAllowed({ surface, field: alias })) return true
  // A flattened leaf (e.g. multiValueHeaders.x-test) is covered by its parent
  // allowlist entry (multiValueHeaders). Walk up the dotted path.
  const parts = alias.split('.')
  for (let i = parts.length - 1; i >= 1; i--) {
    if (isAllowed({ surface, field: parts.slice(0, i).join('.') })) return true
  }
  // The Boom-vs-flat rejection envelope shows up as several body.* field diffs
  // (statusCode / error / message). They are all the one recorded
  // authorizers/body divergence.
  if (
    surface === 'authorizers' &&
    (diff.field === 'body' ||
      diff.field === 'statusCode' ||
      diff.field === 'error' ||
      diff.field === 'message')
  ) {
    return isAllowed({ surface, field: 'body' })
  }
  // The ALB response-headers crash forces us to boot the plugin with a minimal
  // header-less handler, so any ALB response header present on ours but absent
  // on the plugin is the recorded response.headers divergence.
  if (
    surface === 'alb' &&
    diff.field.startsWith('headers.') &&
    diff.plugin == null
  ) {
    return isAllowed({ surface, field: 'response.headers' })
  }
  // The DryRun divergence: ours returns a bare 204, the plugin returns a 400
  // rejection. Beyond the status, the plugin's rejection carries a content-type,
  // an x-amzn-ErrorType header and an error body — all part of the one recorded
  // dryRunStatus divergence (ours is empty on every one of them).
  if (
    surface === 'invoke' &&
    testCase?.name === 'dry-run' &&
    testCase.ours.status === 204
  ) {
    return isAllowed({ surface, field: 'dryRunStatus' })
  }
  return false
}

const SURFACES = [
  { surface: 'rest', run: runRest },
  { surface: 'http-api', run: runHttpApi },
  { surface: 'alb', run: runAlb },
  { surface: 'authorizers', run: runAuthorizers },
  { surface: 'invoke', run: runInvoke },
]

async function pluginAvailable() {
  if (!PLUGIN_DIR) return false
  try {
    await access(PLUGIN_DIR)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!(await pluginAvailable())) {
    console.log(
      'community plugin checkout not available (set SERVERLESS_OFFLINE_DIR to a local serverless-offline clone). Skipping.',
    )
    process.exit(0)
  }

  let unexpectedTotal = 0
  for (const { surface, run } of SURFACES) {
    console.log(`\n=== ${surface} ===`)
    let cases
    try {
      cases = await run()
    } catch (err) {
      console.error(`  BOOT/RUN ERROR: ${err.message}`)
      unexpectedTotal++
      continue
    }
    for (const c of cases) {
      const diffs = diffSnapshots(c.ours, c.plugin)
      const unexpected = diffs.filter((d) => !diffAllowed(surface, d, c))
      const expected = diffs.length - unexpected.length
      if (unexpected.length === 0) {
        console.log(
          `  ${c.name}: OK (${expected} expected diff(s) allowlisted)`,
        )
      } else {
        console.log(
          `  ${c.name}: ${unexpected.length} UNEXPECTED diff(s) (${expected} allowlisted):`,
        )
        for (const d of unexpected) {
          console.log(
            `    - ${d.field}: ours=${JSON.stringify(d.ours)} plugin=${JSON.stringify(d.plugin)}`,
          )
        }
        unexpectedTotal += unexpected.length
      }
    }
  }

  console.log(
    `\n${unexpectedTotal === 0 ? 'PASS' : 'FAIL'}: ${unexpectedTotal} unexpected diff(s)`,
  )
  process.exit(unexpectedTotal === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('differential runner crashed:', err)
  process.exit(2)
})
