import { spawn } from 'node:child_process'
import {
  cp,
  mkdir,
  mkdtemp,
  symlink,
  writeFile,
  readFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SF_CORE = path.resolve(__dirname, '../../../../sf-core/bin/sf-core.js')
const PLUGIN_DIR = '/Users/czubocha/GolandProjects/serverless-offline'

/**
 * Copy a fixture to a temp dir, add `serverless-offline` to plugins, symlink it
 * into node_modules, and boot `sf-core offline`. Because our built-in yields to
 * the community plugin when it is listed in `plugins:`, this boots the COMMUNITY
 * plugin — letting us capture its real behavior as the parity baseline.
 *
 * Returns the same helper shape as the harness, plus the temp dir for cleanup.
 *
 * @param {{ fixtureDir: string, readyMs?: number }} opts
 */
export async function bootCommunityPlugin({ fixtureDir, readyMs = 90_000 }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'so-capture-'))
  await cp(fixtureDir, dir, { recursive: true })
  // Add the plugin to plugins: (append a YAML block; fixtures keep plugins absent).
  const ymlPath = path.join(dir, 'serverless.yml')
  const yml = await readFile(ymlPath, 'utf8')
  await writeFile(ymlPath, `${yml}\nplugins:\n  - serverless-offline\n`)
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
  // serverless-offline's actual ready/port wording (serverless-offline@14, booted
  // under sf-core): the lambda endpoint prints as
  //   "Offline [http for lambda] listening on http://localhost:<lambdaPort>"
  // and the HTTP server prints as "Server ready: http://localhost:<httpPort>".
  // Wait for the "Server ready" line, parsing both bound ports from those lines.
  const deadline = Date.now() + readyMs
  let httpPort, lambdaPort
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`plugin exited:\n${out}`)
    const h = out.match(/Server ready:\s*http:\/\/[^:\s]+:(\d+)/i)
    const l = out.match(
      /\[http for lambda\]\s+listening on\s+http:\/\/[^:\s]+:(\d+)/i,
    )
    if (h) httpPort = h[1]
    if (l) lambdaPort = l[1]
    if (/Server ready/i.test(out) && httpPort) break
    await delay(250)
  }
  async function stop() {
    if (child.exitCode === null) {
      child.kill('SIGINT')
      const limit = Date.now() + 5000
      while (child.exitCode === null && Date.now() < limit) await delay(100)
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  }
  return {
    dir,
    httpUrl: httpPort ? `http://localhost:${httpPort}` : undefined,
    lambdaUrl: lambdaPort ? `http://localhost:${lambdaPort}` : undefined,
    logs: () => out,
    stop,
  }
}
