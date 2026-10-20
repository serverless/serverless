// End-to-end proxy test: run the CLI from source with only HTTPS_PROXY pointing at a proxy, and
// check that a command that talks to the Serverless API works and that its requests went through
// the proxy. `serverless usage` signs in (the platform SDK) and then reads the org's usage (the
// CLI's own requests), so both kinds of request are covered. Runs on the Node.js that runs it.
//
// Environment:
//   SERVERLESS_ACCESS_KEY_DEV  a dev-platform access key; without it the test is skipped, and in
//                              GitHub Actions it fails instead, so a missing secret can't pass
//   AWS_*                      AWS credentials and region; the CLI resolves them on every command
//   E2E_PROXY, E2E_PROXY_LOG   use an externally started proxy, with the log file it writes (the
//                              proxy-only network run); by default the test starts one locally
//
// Not part of any jest suite: run with `npm run test:e2e:proxy -w @serverlessinc/sf-core`, or in a
// network whose only way out is the proxy with tests/e2e/proxy-only-network.sh. Only that run
// proves that no request goes direct: run locally, the proxy log shows the API was reached through
// the proxy, but sign-in and the usage request reach the same host, and a request that bypassed
// the proxy would still succeed.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.join(here, '..', '..', 'bin', 'sf-core.js')
// The forward proxy of the npm installer's end-to-end tests: it tunnels CONNECT requests and logs
// one line per request
const proxyScript = path.join(
  here,
  '..',
  '..',
  '..',
  'sf-core-installer',
  'tests',
  'e2e',
  'proxy.js',
)
const TIMEOUT = 180000
const accessKey = process.env.SERVERLESS_ACCESS_KEY_DEV

const run = (args, { env, cwd }) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, cwd })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, output }))
  })

// The variables the CLI gets: no proxy settings or NO_PROXY from this environment, so the proxy
// below is the only one in play
const cliEnv = (home, proxy) => {
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    CI: '1',
    SERVERLESS_PLATFORM_STAGE: 'dev',
    SERVERLESS_ACCESS_KEY: accessKey,
    HTTPS_PROXY: proxy,
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('AWS_') || name === 'NODE_EXTRA_CA_CERTS') {
      env[name] = value
    }
  }
  return env
}

describe(
  'requests to the Serverless API through a proxy',
  {
    skip:
      !accessKey &&
      !process.env.GITHUB_ACTIONS &&
      'SERVERLESS_ACCESS_KEY_DEV is not set',
  },
  () => {
    let work
    let proxy = process.env.E2E_PROXY
    let proxyLog = process.env.E2E_PROXY_LOG
    let localProxy

    before(async () => {
      assert.ok(accessKey, 'SERVERLESS_ACCESS_KEY_DEV is not set')
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-e2e-proxy-'))
      if (proxy) return
      proxyLog = path.join(work, 'proxy.log')
      fs.writeFileSync(proxyLog, '')
      localProxy = spawn(process.execPath, [proxyScript, proxyLog])
      proxy = await new Promise((resolve, reject) => {
        localProxy.on('error', reject)
        localProxy.on('exit', (code) =>
          reject(new Error(`the proxy exited with code ${code}`)),
        )
        localProxy.stdout.on('data', (chunk) => {
          const match = /proxy listening on (\S+)/.exec(chunk)
          if (match) resolve(match[1])
        })
      })
    })

    after(() => {
      localProxy?.kill()
      if (work) fs.rmSync(work, { recursive: true, force: true })
    })

    test(
      `serverless usage works on Node.js ${process.versions.node}`,
      { timeout: TIMEOUT },
      async () => {
        const home = fs.mkdtempSync(path.join(work, 'home-'))
        const cwd = fs.mkdtempSync(path.join(work, 'service-'))
        const logStart = fs.statSync(proxyLog).size

        const { code, output } = await run([cli, 'usage'], {
          env: cliEnv(home, proxy),
          cwd,
        })

        assert.equal(code, 0, output)
        assert.match(output, /org used \d+ Instance Credits this month/)
        const proxied = fs
          .readFileSync(proxyLog, 'utf8')
          .slice(logStart)
          .split('\n')
        assert.ok(
          proxied.includes('CONNECT core.serverless-dev.com:443'),
          `the proxy saw no request to the Serverless API:\n${proxied.join('\n')}`,
        )
      },
    )
  },
)
