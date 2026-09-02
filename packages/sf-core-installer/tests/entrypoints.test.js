const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')

// The contract under test is the exit code npm (or the shell) observes, so
// these tests run the real entrypoint scripts as subprocesses, from a copy of
// the package so download attempts cannot touch the working tree.
const packageDir = path.join(__dirname, '..')
let workDir

const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'npm_config_proxy',
  'npm_config_https_proxy',
  'npm_config_noproxy',
]

const runScript = (script, env, args = []) => {
  const cleanEnv = { ...process.env }
  for (const key of PROXY_ENV_KEYS) delete cleanEnv[key]
  return spawnSync(process.execPath, [script, ...args], {
    cwd: workDir,
    env: { ...cleanEnv, ...env },
    encoding: 'utf8',
    timeout: 30000,
  })
}

before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-installer-e2e-'))
  for (const file of ['binary.js', 'postInstall.js', 'run.js']) {
    fs.copyFileSync(path.join(packageDir, file), path.join(workDir, file))
  }
  // Copy only the undici dependency — the package's own node_modules/.bin may
  // already hold a downloaded launcher binary, which would let run.js skip the
  // download under test.
  if (!fs.existsSync(path.join(packageDir, 'node_modules', 'undici'))) {
    throw new Error(
      'packages/sf-core-installer has no node_modules/undici — the package is ' +
        'outside the npm workspaces; run `npm ci --ignore-scripts` in it first.',
    )
  }
  fs.cpSync(
    path.join(packageDir, 'node_modules', 'undici'),
    path.join(workDir, 'node_modules', 'undici'),
    { recursive: true },
  )
})

after(() => {
  fs.rmSync(workDir, { recursive: true, force: true })
})

describe('postInstall.js — must never fail npm install', () => {
  test('exits 0 when the download cannot go through (unreachable proxy)', () => {
    const result = runScript('postInstall.js', {
      HTTPS_PROXY: 'http://127.0.0.1:9',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stderr, /Could not pre-download/)
    assert.match(result.stderr, /first time/)
  })

  test('exits 0 on an invalid proxy configuration', () => {
    const result = runScript('postInstall.js', {
      HTTPS_PROXY: '://not a url',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stderr, /Could not pre-download/)
  })

  test('exits 0 on an invalid npm-provided proxy configuration', () => {
    const result = runScript('postInstall.js', {
      npm_config_https_proxy: '://not a url',
    })
    assert.equal(result.status, 0, result.stderr)
  })
})

describe(
  'Binary.run — exit code propagation',
  { skip: process.platform === 'win32' },
  () => {
    // Runs Binary.run() against a fake executable placed where the binary is
    // expected, so spawnSync's result handling is exercised for real.
    const runWithFakeBinary = (script) => {
      const dir = fs.mkdtempSync(path.join(workDir, 'fake-'))
      fs.writeFileSync(path.join(dir, 'fake-0.0.0'), `#!/bin/sh\n${script}\n`, {
        mode: 0o755,
      })
      const runner = path.join(dir, 'runner.js')
      fs.writeFileSync(
        runner,
        `const { Binary } = require('../binary')
new Binary('fake', 'https://example.com/x', '0.0.0', { installDirectory: ${JSON.stringify(dir)} }).run()`,
      )
      return spawnSync(process.execPath, [runner, 'arg1', 'arg2'], {
        cwd: workDir,
        encoding: 'utf8',
        timeout: 30000,
      })
    }

    test('forwards the child exit code', () => {
      const result = runWithFakeBinary('exit 3')
      assert.equal(result.status, 3)
    })

    test('forwards arguments to the binary', () => {
      const result = runWithFakeBinary('echo "$@"')
      assert.equal(result.status, 0)
      assert.equal(result.stdout.trim(), 'arg1 arg2')
    })

    test('reports 128 + signal number when the child is killed by a signal', () => {
      // Previously status null became process.exit(null) === success.
      const result = runWithFakeBinary('kill -9 $$')
      assert.equal(result.status, 128 + 9)
    })
  },
)

describe(
  'Binary.install — interrupted download',
  { skip: process.platform === 'win32' },
  () => {
    // Starts a download that never completes (fetch is stubbed to hang), then
    // signals the process; the exit status must follow the 128 + signal
    // convention rather than a generic 1.
    const interruptDownload = (signal) =>
      new Promise((resolve, reject) => {
        const dir = fs.mkdtempSync(path.join(workDir, 'interrupt-'))
        const runner = path.join(dir, 'runner.js')
        fs.writeFileSync(
          runner,
          `const { Binary } = require('../binary')
// The marker is emitted from inside fetch(), i.e. after install() has
// registered its signal handlers — printing earlier races the kill. A bare
// pending Promise would not keep the event loop alive (the process would
// exit 0 by itself), so hold a timer like a real socket would.
globalThis.fetch = () => {
  process.stdout.write('downloading\\n')
  setTimeout(() => {}, 60000)
  return new Promise(() => {})
}
new Binary('fake', 'https://example.com/x', '0.0.0', { installDirectory: ${JSON.stringify(path.join(dir, 'bin'))} })
  .install(true)
  .then(() => process.exit(0), () => process.exit(1))`,
        )
        const child = spawn(process.execPath, [runner], { cwd: workDir })
        child.stdout.once('data', () => child.kill(signal))
        child.on('error', reject)
        child.on('close', (code, sig) => resolve({ code, sig }))
      })

    test('SIGTERM during the download exits 143', async () => {
      const { code } = await interruptDownload('SIGTERM')
      assert.equal(code, 128 + 15)
    })

    test('SIGINT during the download exits 130', async () => {
      const { code } = await interruptDownload('SIGINT')
      assert.equal(code, 128 + 2)
    })
  },
)

describe('run.js — must fail hard when the binary cannot be obtained', () => {
  test('exits 1 with the underlying error when the download fails', () => {
    const result = runScript('run.js', { HTTPS_PROXY: 'http://127.0.0.1:9' }, [
      '--version',
    ])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Could not download the Serverless Framework/)
    // The message must carry the underlying cause, not just "fetch failed".
    assert.match(result.stderr, /ECONNREFUSED|EADDRNOTAVAIL/)
  })

  test('exits 1 on an invalid proxy configuration', () => {
    const result = runScript('run.js', { HTTPS_PROXY: '://not a url' }, [
      '--version',
    ])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Could not download the Serverless Framework/)
  })
})
