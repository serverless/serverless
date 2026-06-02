import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'
import { fourFreePorts } from './_ports.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// repo root → packages/serverless/test/integration/offline → up 4 lands in packages
const SF_CORE = path.resolve(__dirname, '../../../../sf-core/bin/sf-core.js')

const READY_RE = /sls offline ready/i
const HTTP_RE = /HTTP endpoint:\s*(\S+)/i
const LAMBDA_RE = /Lambda endpoint:\s*(\S+)/i
// ALB / WebSocket servers boot only when the service has alb / websocket
// events, so their banner lines are OPTIONAL — most fixtures won't print them.
const ALB_RE = /ALB endpoint:\s*(\S+)/i
const WS_RE = /WebSocket endpoint:\s*(\S+)/i

/**
 * Kill a child with SIGKILL and briefly await its exit, so callers never leak
 * a process when bailing out on an error path.
 *
 * @param {import('node:child_process').ChildProcess} child
 */
async function killChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGKILL')
  const limit = Date.now() + 5000
  while (
    child.exitCode === null &&
    child.signalCode === null &&
    Date.now() < limit
  )
    await delay(50)
}

/**
 * Boot our built-in `sls offline` against a fixture dir as a child process.
 * The fixture must NOT list serverless-offline in plugins (so OUR impl runs).
 * By default the harness picks four distinct free ephemeral ports and passes
 * them as --httpPort / --lambdaPort / --websocketPort / --albPort so concurrent
 * boots never collide; the actual bound URLs are still parsed from the ready
 * banner.
 *
 * Pass `injectPorts: false` to skip the port injection so a fixture's own
 * custom.serverless-offline httpPort / lambdaPort take effect (useful for
 * asserting config-compatibility behavior). Pass `extraArgs` to append
 * additional CLI flags (e.g. ['--httpPort', '4170']). Both are opt-in and
 * backward-compatible — the default keeps injecting free ports.
 *
 * @param {{ cwd: string, env?: Record<string,string>, readyMs?: number, injectPorts?: boolean, extraArgs?: string[] }} opts
 */
export async function bootOffline({
  cwd,
  env = {},
  readyMs = 60_000,
  injectPorts = true,
  extraArgs = [],
}) {
  const args = [SF_CORE, 'offline']
  if (injectPorts) {
    const [httpPort, lambdaPort, websocketPort, albPort] = await fourFreePorts()
    args.push(
      '--httpPort',
      String(httpPort),
      '--lambdaPort',
      String(lambdaPort),
      '--websocketPort',
      String(websocketPort),
      '--albPort',
      String(albPort),
    )
  }
  args.push(...extraArgs)
  const child = spawn('node', args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout.on('data', (d) => (out += d.toString()))
  child.stderr.on('data', (d) => (out += d.toString()))

  const deadline = Date.now() + readyMs
  let httpUrl, lambdaUrl, albUrl, wsUrl
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`offline exited early (code ${child.exitCode}):\n${out}`)
    }
    const h = out.match(HTTP_RE)
    const l = out.match(LAMBDA_RE)
    // Key readiness on the always-present HTTP + Lambda lines; ALB / WebSocket
    // are optional (only printed when the fixture has those events).
    if (READY_RE.test(out) && h && l) {
      httpUrl = h[1]
      lambdaUrl = l[1]
      albUrl = out.match(ALB_RE)?.[1]
      wsUrl = out.match(WS_RE)?.[1]
      break
    }
    await delay(250)
  }
  if (!httpUrl) {
    // Readiness deadline passed while the child is still alive: kill it before
    // throwing so the test's afterAll never leaks an orphaned offline process.
    await killChild(child)
    throw new Error(`offline did not become ready:\n${out}`)
  }

  const http = (p, init) => fetch(`${httpUrl}${p}`, init)
  // Drive the ALB server on its own port. Throws a clear error when the fixture
  // declared no alb events (so no ALB server was started / banner printed).
  const albHttp = (p, init) => {
    if (!albUrl)
      throw new Error(
        'albHttp() called but no ALB endpoint was printed — the fixture has no alb events',
      )
    return fetch(`${albUrl}${p}`, init)
  }
  const invoke = (deployedName, payload, { async: ev } = {}) =>
    fetch(`${lambdaUrl}/2015-03-31/functions/${deployedName}/invocations`, {
      method: 'POST',
      headers: ev ? { 'x-amz-invocation-type': 'Event' } : {},
      body: payload === undefined ? '' : JSON.stringify(payload),
    })

  async function stop() {
    if (child.exitCode === null) {
      child.kill('SIGINT')
      const limit = Date.now() + 5000
      while (child.exitCode === null && Date.now() < limit) await delay(100)
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  }

  // Open a WebSocket against the WebSocket server (its own port). The WS URL is
  // http(s); swap the scheme to ws(s) and append the optional path (e.g. a
  // query string for $connect). Throws a clear error when the fixture declared
  // no websocket events (so no WebSocket server was started / banner printed).
  const wsConnect = (p = '') => {
    if (!wsUrl)
      throw new Error(
        'wsConnect() called but no WebSocket endpoint was printed — the fixture has no websocket events',
      )
    return new WebSocket(`${wsUrl.replace(/^http/, 'ws')}${p}`)
  }

  return {
    httpUrl,
    lambdaUrl,
    albUrl,
    wsUrl,
    http,
    albHttp,
    invoke,
    wsConnect,
    logs: () => out,
    stop,
    child,
  }
}
