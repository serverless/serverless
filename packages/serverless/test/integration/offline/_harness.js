import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'
import { twoFreePorts } from './_ports.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// repo root → packages/serverless/test/integration/offline → up 4 lands in packages
const SF_CORE = path.resolve(__dirname, '../../../../sf-core/bin/sf-core.js')

const READY_RE = /sls offline ready/i
const APP_RE = /App endpoint:\s*(\S+)/i
const LAMBDA_RE = /Lambda endpoint:\s*(\S+)/i

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
 * By default the harness picks two distinct free ephemeral ports and passes
 * them as --appPort / --lambdaPort so concurrent boots never collide; the
 * actual bound URLs are still parsed from the ready banner.
 *
 * Pass `injectPorts: false` to skip the --appPort/--lambdaPort injection so a
 * fixture's own custom.serverless-offline httpPort / lambdaPort take effect
 * (useful for asserting config-compatibility behavior). Pass `extraArgs` to
 * append additional CLI flags (e.g. ['--httpPort', '4170']). Both are opt-in
 * and backward-compatible — the default keeps injecting free ports.
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
    const [appPort, lambdaPort] = await twoFreePorts()
    args.push('--appPort', String(appPort), '--lambdaPort', String(lambdaPort))
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
  let appUrl, lambdaUrl
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`offline exited early (code ${child.exitCode}):\n${out}`)
    }
    const a = out.match(APP_RE)
    const l = out.match(LAMBDA_RE)
    if (READY_RE.test(out) && a && l) {
      appUrl = a[1]
      lambdaUrl = l[1]
      break
    }
    await delay(250)
  }
  if (!appUrl) {
    // Readiness deadline passed while the child is still alive: kill it before
    // throwing so the test's afterAll never leaks an orphaned offline process.
    await killChild(child)
    throw new Error(`offline did not become ready:\n${out}`)
  }

  const http = (p, init) => fetch(`${appUrl}${p}`, init)
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

  // Open a WebSocket against the app server (shares appPort with HTTP). The
  // app URL is http(s); swap the scheme to ws(s) and append the optional path
  // (e.g. a query string for $connect).
  const wsConnect = (p = '') =>
    new WebSocket(`${appUrl.replace(/^http/, 'ws')}${p}`)

  return {
    appUrl,
    lambdaUrl,
    http,
    invoke,
    wsConnect,
    logs: () => out,
    stop,
    child,
  }
}
