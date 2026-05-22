import path from 'node:path'
import { getHandlerBaseDir } from '../../../../../../../lib/plugins/aws/offline/lib/handler-base-dir.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal serverless stub for getHandlerBaseDir tests.
 *
 * @param {object} opts
 * @param {string|undefined} opts.serviceDir         - serverless.serviceDir
 * @param {string|undefined} opts.configServicePath  - serverless.config.servicePath
 * @param {string|undefined} opts.customLocation     - custom['serverless-offline'].location
 */
function makeServerless({
  serviceDir,
  configServicePath,
  customLocation,
} = {}) {
  const stub = {}

  if (serviceDir !== undefined) {
    stub.serviceDir = serviceDir
  }

  if (configServicePath !== undefined) {
    stub.config = { servicePath: configServicePath }
  }

  if (customLocation !== undefined) {
    stub.service = {
      custom: {
        'serverless-offline': {
          location: customLocation,
        },
      },
    }
  }

  return stub
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getHandlerBaseDir', () => {
  // 1. No bundler: no custom location, serviceDir and config.servicePath match
  it('1. returns serviceDir when no custom location is set', () => {
    const sl = makeServerless({ serviceDir: '/x', configServicePath: '/x' })
    expect(getHandlerBaseDir(sl)).toBe('/x')
  })

  // 2. Built-in esbuild swap: config.servicePath is set to build output,
  //    no custom location — the swapped path is returned as-is.
  it('2. returns config.servicePath when serviceDir is absent and no custom location', () => {
    const sl = makeServerless({ configServicePath: '/x/.serverless/build' })
    expect(getHandlerBaseDir(sl)).toBe('/x/.serverless/build')
  })

  // 3. Community serverless-esbuild: custom location is set
  it('3. resolves custom location against serviceDir', () => {
    const sl = makeServerless({
      serviceDir: '/x',
      configServicePath: '/x',
      customLocation: '.esbuild/.build',
    })
    expect(getHandlerBaseDir(sl)).toBe(path.resolve('/x', '.esbuild/.build'))
  })

  // 4. Both built-in swap AND custom location (theoretical): customLocation wins
  it('4. customLocation wins over the swapped config.servicePath when both are present', () => {
    // Simulates a hypothetical scenario where both contracts are active.
    // customLocation is the explicit, offline-specific contract and takes priority.
    const sl = makeServerless({
      serviceDir: '/x/.serverless/build', // already swapped by built-in
      configServicePath: '/x/.serverless/build',
      customLocation: '.esbuild/.build',
    })
    expect(getHandlerBaseDir(sl)).toBe(
      path.resolve('/x/.serverless/build', '.esbuild/.build'),
    )
  })

  // 5. config.servicePath missing but serviceDir present
  it('5. returns serviceDir when config.servicePath is absent', () => {
    const sl = makeServerless({ serviceDir: '/myservice' })
    expect(getHandlerBaseDir(sl)).toBe('/myservice')
  })

  // 6. Both serviceDir and config.servicePath missing — falls back to process.cwd()
  it('6. falls back to process.cwd() when both serviceDir and config.servicePath are absent', () => {
    const sl = makeServerless() // no serviceDir, no config
    expect(getHandlerBaseDir(sl)).toBe(process.cwd())
  })

  // 7. serviceDir takes precedence over config.servicePath when both present
  it('7. serviceDir takes precedence over config.servicePath', () => {
    const sl = makeServerless({
      serviceDir: '/primary',
      configServicePath: '/secondary',
    })
    expect(getHandlerBaseDir(sl)).toBe('/primary')
  })

  // 8. Custom location resolves to absolute path even if given an absolute path
  it('8. absolute customLocation is resolved correctly (path.resolve handles it)', () => {
    const sl = makeServerless({
      serviceDir: '/x',
      customLocation: '/abs/build',
    })
    // path.resolve('/x', '/abs/build') === '/abs/build' on POSIX
    expect(getHandlerBaseDir(sl)).toBe(path.resolve('/x', '/abs/build'))
  })
})
