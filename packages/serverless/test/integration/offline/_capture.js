import { spawn } from 'node:child_process'
import {
  cp,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
  readFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import yaml from 'js-yaml'
import { twoFreePorts } from './_ports.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SF_CORE = path.resolve(__dirname, '../../../../sf-core/bin/sf-core.js')
// Path to a local `serverless-offline` checkout — used only by the differential
// drift-detector (`npm run test:offline:compat`) to boot the community plugin for
// comparison. Set SERVERLESS_OFFLINE_DIR to enable it; unset leaves it disabled.
const PLUGIN_DIR = process.env.SERVERLESS_OFFLINE_DIR

/**
 * Kill a child with SIGKILL and briefly await its exit, so error paths never
 * leak a process.
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
 * Copy a fixture to a temp dir, add `serverless-offline` to plugins, symlink it
 * into node_modules, and boot `sf-core offline`. Because our built-in yields to
 * the community plugin when it is listed in `plugins:`, this boots the COMMUNITY
 * plugin — letting us capture its real behavior as the parity baseline.
 *
 * A distinct free port pair is written into the copied fixture's
 * `custom.serverless-offline.httpPort`/`lambdaPort` (overriding any `0`) so the
 * plugin binds and reports real, routable ports we can drive requests against.
 *
 * Returns the same helper shape as the harness, plus the temp dir; `stop()`
 * removes that temp dir so repeated captures don't litter os.tmpdir().
 *
 * @param {{ fixtureDir: string, readyMs?: number }} opts
 */
export async function bootCommunityPlugin({ fixtureDir, readyMs = 90_000 }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'so-capture-'))
  await cp(fixtureDir, dir, { recursive: true })
  // Pin real, routable ports: httpPort/lambdaPort 0 makes the plugin echo `:0`
  // in its banners, which is unroutable. Override with a distinct free pair.
  const [httpPort, lambdaPort] = await twoFreePorts()
  const ymlPath = path.join(dir, 'serverless.yml')
  const doc = yaml.load(await readFile(ymlPath, 'utf8')) ?? {}
  // Register the community plugin so our built-in yields to it.
  doc.plugins = [...(doc.plugins ?? []), 'serverless-offline']
  // Force routable ports: httpPort/lambdaPort 0 makes the plugin echo `:0` in
  // its banners (unroutable). Overwrite with the distinct free pair so it binds
  // and reports real ports we can drive requests against.
  doc.custom = { ...(doc.custom ?? {}) }
  doc.custom['serverless-offline'] = {
    ...(doc.custom['serverless-offline'] ?? {}),
    httpPort,
    lambdaPort,
  }
  await writeFile(ymlPath, yaml.dump(doc))
  if (!PLUGIN_DIR) {
    throw new Error(
      'SERVERLESS_OFFLINE_DIR is not set — point it at a local serverless-offline checkout to run the differential drift-detector.',
    )
  }
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

  // serverless-offline's actual ready/port wording (serverless-offline@14, booted
  // under sf-core): the lambda endpoint prints as
  //   "Offline [http for lambda] listening on http://localhost:<lambdaPort>"
  // and the HTTP server prints as "Server ready: http://localhost:<httpPort>".
  // Wait for the "Server ready" line, parsing both bound ports from those lines.
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
    await delay(250)
  }
  if (!httpBound) {
    // Kill + clean up, then throw an actionable error (consistent with the
    // harness) rather than returning undefined ports silently.
    await stop()
    throw new Error(`community plugin did not become ready:\n${out}`)
  }

  return {
    dir,
    httpUrl: `http://localhost:${httpBound}`,
    lambdaUrl: lambdaBound ? `http://localhost:${lambdaBound}` : undefined,
    logs: () => out,
    stop,
  }
}
