const { test, describe, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')

const {
  Binary,
  childExitCode,
  describeError,
  getProxyUrl,
  install,
} = require('../binary')

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

const savedEnv = {}
const realFetch = globalThis.fetch

beforeEach(() => {
  for (const key of PROXY_ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of PROXY_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  globalThis.fetch = realFetch
})

describe('describeError', () => {
  test('returns the message for a plain error', () => {
    assert.equal(describeError(new Error('boom')), 'boom')
  })

  test('includes both message and code of the cause', () => {
    const error = new Error('fetch failed', {
      cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9'), {
        code: 'ECONNREFUSED',
      }),
    })
    assert.equal(
      describeError(error),
      'fetch failed: connect ECONNREFUSED 127.0.0.1:9 (ECONNREFUSED)',
    )
  })

  test('includes the code of the root error', () => {
    const error = Object.assign(new Error('boom'), { code: 'EBOOM' })
    assert.equal(describeError(error), 'boom (EBOOM)')
  })

  test('falls back to the error name when the message is empty', () => {
    const error = new AggregateError([
      Object.assign(new Error('x'), { code: 'E1' }),
    ])
    assert.equal(describeError(error), 'AggregateError: x (E1)')
  })

  test('falls back to the cause message when there is no code', () => {
    const error = new Error('fetch failed', {
      cause: new Error('unexpected TLS alert'),
    })
    assert.equal(describeError(error), 'fetch failed: unexpected TLS alert')
  })

  test('walks nested causes', () => {
    const inner = Object.assign(new Error('inner'), { code: 'ETIMEDOUT' })
    const error = new Error('fetch failed', {
      cause: new Error('request to host failed', { cause: inner }),
    })
    assert.equal(
      describeError(error),
      'fetch failed: request to host failed: inner (ETIMEDOUT)',
    )
  })

  test('lists AggregateError sub-errors', () => {
    const aggregate = new AggregateError([
      Object.assign(new Error('a'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('b'), { code: 'ETIMEDOUT' }),
    ])
    const error = new Error('fetch failed', { cause: aggregate })
    assert.equal(
      describeError(error),
      'fetch failed: AggregateError: a (ECONNREFUSED), b (ETIMEDOUT)',
    )
  })

  test('handles a non-error cause', () => {
    const error = new Error('fetch failed', { cause: 'plain string cause' })
    assert.equal(describeError(error), 'fetch failed: plain string cause')
  })

  test('terminates on a cyclic cause chain', () => {
    const a = new Error('a')
    const b = new Error('b', { cause: a })
    a.cause = b
    assert.equal(describeError(a), 'a: b')
  })

  test('never throws on non-error input', () => {
    assert.equal(typeof describeError(undefined), 'string')
    assert.equal(typeof describeError(null), 'string')
    assert.equal(describeError('oops'), 'oops')
  })
})

describe('getProxyUrl', () => {
  const httpsUrl = 'https://install.serverless.com/installer-builds/x'
  const httpUrl = 'http://install.serverless.com/installer-builds/x'

  test('returns null when no proxy is configured', () => {
    assert.equal(getProxyUrl(httpsUrl), null)
  })

  test('uses HTTPS_PROXY for https urls', () => {
    process.env.HTTPS_PROXY = 'http://proxy:8080'
    assert.equal(getProxyUrl(httpsUrl), 'http://proxy:8080')
  })

  test('uses HTTP_PROXY for http urls', () => {
    process.env.HTTP_PROXY = 'http://proxy:8080'
    assert.equal(getProxyUrl(httpUrl), 'http://proxy:8080')
  })

  test('falls back to npm_config_https_proxy for https urls', () => {
    process.env.npm_config_https_proxy = 'http://npm-proxy:8080'
    assert.equal(getProxyUrl(httpsUrl), 'http://npm-proxy:8080')
  })

  // npm itself resolves https requests as `httpsProxy || proxy`
  test('falls back to npm_config_proxy for https urls (mirrors npm)', () => {
    process.env.npm_config_proxy = 'http://npm-proxy:8080'
    assert.equal(getProxyUrl(httpsUrl), 'http://npm-proxy:8080')
  })

  test('npm_config_https_proxy wins over npm_config_proxy', () => {
    process.env.npm_config_https_proxy = 'http://npm-https-proxy:8080'
    process.env.npm_config_proxy = 'http://npm-proxy:8080'
    assert.equal(getProxyUrl(httpsUrl), 'http://npm-https-proxy:8080')
  })

  test('falls back to npm_config_proxy for http urls', () => {
    process.env.npm_config_proxy = 'http://npm-proxy:8080'
    assert.equal(getProxyUrl(httpUrl), 'http://npm-proxy:8080')
  })

  test('environment variables win over npm config', () => {
    process.env.HTTPS_PROXY = 'http://env-proxy:8080'
    process.env.npm_config_https_proxy = 'http://npm-proxy:8080'
    assert.equal(getProxyUrl(httpsUrl), 'http://env-proxy:8080')
  })

  test('NO_PROXY=* bypasses the proxy', () => {
    process.env.HTTPS_PROXY = 'http://proxy:8080'
    process.env.NO_PROXY = '*'
    assert.equal(getProxyUrl(httpsUrl), null)
  })

  test('NO_PROXY host suffix match bypasses the proxy', () => {
    process.env.HTTPS_PROXY = 'http://proxy:8080'
    process.env.NO_PROXY = 'serverless.com'
    assert.equal(getProxyUrl(httpsUrl), null)
  })

  test('npm_config_noproxy bypasses the proxy', () => {
    process.env.npm_config_https_proxy = 'http://npm-proxy:8080'
    process.env.npm_config_noproxy = 'serverless.com'
    assert.equal(getProxyUrl(httpsUrl), null)
  })

  test('newline-joined npm_config_noproxy (array-form .npmrc) bypasses the proxy', () => {
    process.env.npm_config_https_proxy = 'http://npm-proxy:8080'
    process.env.npm_config_noproxy = 'example.com\n\nserverless.com'
    assert.equal(getProxyUrl(httpsUrl), null)
  })

  test('empty NO_PROXY entries never match', () => {
    process.env.HTTPS_PROXY = 'http://proxy:8080'
    process.env.NO_PROXY = 'example.com,,'
    assert.equal(getProxyUrl(httpsUrl), 'http://proxy:8080')
  })

  test('non-matching NO_PROXY keeps the proxy', () => {
    process.env.HTTPS_PROXY = 'http://proxy:8080'
    process.env.NO_PROXY = 'example.com'
    assert.equal(getProxyUrl(httpsUrl), 'http://proxy:8080')
  })
})

describe('Binary.install', () => {
  let installDirectory

  const makeBinary = () =>
    new Binary('test-binary', 'https://install.serverless.com/x', '0.0.0', {
      installDirectory,
    })

  beforeEach(() => {
    installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-installer-'))
  })

  afterEach(() => {
    fs.rmSync(installDirectory, { recursive: true, force: true })
  })

  test('downloads and writes an executable binary', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      arrayBuffer: async () =>
        new TextEncoder().encode('binary-content').buffer,
    })
    const binary = makeBinary()
    await binary.install(true)
    assert.equal(fs.readFileSync(binary.binaryPath, 'utf8'), 'binary-content')
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(binary.binaryPath).mode & 0o777, 0o755)
    }
  })

  test('skips the download when the binary already exists', async () => {
    let fetchCalls = 0
    globalThis.fetch = async () => {
      fetchCalls += 1
      throw new Error('should not be called')
    }
    const binary = makeBinary()
    fs.writeFileSync(binary.binaryPath, 'existing')
    await binary.install(true)
    assert.equal(fetchCalls, 0)
  })

  test('rejects with the original error on network failure', async () => {
    globalThis.fetch = async () => {
      throw new Error('fetch failed', {
        cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
      })
    }
    const binary = makeBinary()
    await assert.rejects(binary.install(true), (error) => {
      assert.equal(describeError(error), 'fetch failed: reset (ECONNRESET)')
      return true
    })
    assert.equal(fs.existsSync(binary.binaryPath), false)
  })

  test('rejects on a non-2xx response and leaves no binary behind', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    })
    const binary = makeBinary()
    await assert.rejects(binary.install(true), /HTTP 403/)
    assert.equal(fs.existsSync(binary.binaryPath), false)
  })

  test('rejects instead of throwing on an invalid proxy configuration', async () => {
    process.env.HTTPS_PROXY = '://not a url'
    const binary = makeBinary()
    // A synchronous throw here would escape entrypoint .catch() handlers and
    // abort npm install; it must surface as a rejection.
    await assert.rejects(binary.install(true))
  })

  test('constructor rejects invalid parameters by throwing', () => {
    assert.throws(() => new Binary('name', 42, '0.0.0'), /url must be a string/)
  })
})

describe('childExitCode', () => {
  test('forwards a numeric status', () => {
    assert.equal(childExitCode({ status: 0, signal: null }), 0)
    assert.equal(childExitCode({ status: 3, signal: null }), 3)
  })

  test('maps a signal death to 128 + signal number', () => {
    assert.equal(childExitCode({ status: null, signal: 'SIGTERM' }), 143)
    assert.equal(childExitCode({ status: null, signal: 'SIGKILL' }), 137)
  })

  test('falls back to 1 for an unknown signal', () => {
    assert.equal(childExitCode({ status: null, signal: 'SIGWHATEVER' }), 1)
  })
})

describe('install (module entrypoint)', () => {
  test('rejects on an unsupported architecture instead of exiting', async () => {
    const realArch = os.arch
    os.arch = () => 'ia32'
    try {
      await assert.rejects(install(), /not supported/)
    } finally {
      os.arch = realArch
    }
  })
})
