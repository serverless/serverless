import { assertSupportedRuntimes } from '../../../../../../../lib/plugins/aws/offline/lib/runtime-guard.js'

/**
 * Builds a minimal serverless-like object for use in tests.
 *
 * @param {string|undefined} providerRuntime
 * @param {Record<string, {runtime?: string}>} functions
 * @returns {{ service: { provider: { runtime?: string }, functions: Record<string, {runtime?: string}> } }}
 */
const makeServerless = (providerRuntime, functions = {}) => ({
  service: {
    provider: providerRuntime !== undefined ? { runtime: providerRuntime } : {},
    functions,
  },
})

describe('assertSupportedRuntimes', () => {
  it('does not throw when all functions use a Node provider runtime', () => {
    const sls = makeServerless('nodejs20.x', {
      hello: {},
      world: {},
    })
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('does not throw when functions map is empty', () => {
    const sls = makeServerless('nodejs20.x', {})
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('does not throw when functions is absent (undefined)', () => {
    const sls = {
      service: {
        provider: { runtime: 'nodejs20.x' },
        functions: undefined,
      },
    }
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('throws when provider runtime is unsupported and no function overrides it', () => {
    const sls = makeServerless('ruby3.3', {
      myFn: {},
      otherFn: {},
    })
    expect(() => assertSupportedRuntimes(sls)).toThrow(
      expect.objectContaining({ code: 'OFFLINE_UNSUPPORTED_RUNTIME' }),
    )
  })

  it('lists every offending function and its runtime in the error message', () => {
    const sls = makeServerless('ruby3.3', {
      myFn: {},
      otherFn: {},
    })
    let error
    try {
      assertSupportedRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error.message).toContain('myFn')
    expect(error.message).toContain('ruby3.3')
    expect(error.message).toContain('otherFn')
  })

  it('function-level supported runtime override makes that function pass even with unsupported provider', () => {
    // otherFn inherits ruby3.3 → still throws; nodeOnlyFn is fine on its own
    const sls = makeServerless('ruby3.3', {
      nodeOnlyFn: { runtime: 'nodejs20.x' },
      otherFn: {},
    })
    let error
    try {
      assertSupportedRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error).toBeDefined()
    expect(error.code).toBe('OFFLINE_UNSUPPORTED_RUNTIME')
    // The Node function must not appear in the error
    expect(error.message).not.toContain('nodeOnlyFn')
    // The ruby function must appear
    expect(error.message).toContain('otherFn')
  })

  it('throws for a function-level unsupported override even when provider runtime is supported', () => {
    const sls = makeServerless('nodejs20.x', {
      goodFn: {},
      badFn: { runtime: 'ruby3.3' },
    })
    let error
    try {
      assertSupportedRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error).toBeDefined()
    expect(error.code).toBe('OFFLINE_UNSUPPORTED_RUNTIME')
    expect(error.message).toContain('badFn')
    expect(error.message).toContain('ruby3.3')
    expect(error.message).not.toContain('goodFn')
  })

  it('lists multiple offenders with different unsupported runtimes in one error', () => {
    const sls = makeServerless('nodejs20.x', {
      goFn: { runtime: 'go1.x' },
      rubyFn: { runtime: 'ruby3.3' },
    })
    let error
    try {
      assertSupportedRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error).toBeDefined()
    expect(error.message).toContain('goFn')
    expect(error.message).toContain('go1.x')
    expect(error.message).toContain('rubyFn')
    expect(error.message).toContain('ruby3.3')
  })

  it('skips silently when both provider runtime and function runtime are undefined', () => {
    const sls = {
      service: {
        provider: {},
        functions: { myFn: {} },
      },
    }
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('error code is OFFLINE_UNSUPPORTED_RUNTIME', () => {
    const sls = makeServerless('ruby3.3', { fn: {} })
    let error
    try {
      assertSupportedRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error.code).toBe('OFFLINE_UNSUPPORTED_RUNTIME')
  })

  it('accepts nodejs18.x as a valid Node runtime', () => {
    const sls = makeServerless('nodejs18.x', { fn: {} })
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('accepts nodejs20.x as a valid Node runtime', () => {
    const sls = makeServerless('nodejs20.x', { fn: {} })
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('accepts nodejs22.x as a valid Node runtime', () => {
    const sls = makeServerless('nodejs22.x', { fn: {} })
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('accepts a bare nodejsN runtime without the .x suffix', () => {
    const sls = makeServerless('nodejs20', { fn: {} })
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  // M5b additions — python3.x is now a supported runtime family.
  it('accepts python3.11 as a valid Python runtime', () => {
    const sls = makeServerless('python3.11', { fn: {} })
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('accepts python3.12 and python3.13', () => {
    expect(() =>
      assertSupportedRuntimes(makeServerless('python3.12', { fn: {} })),
    ).not.toThrow()
    expect(() =>
      assertSupportedRuntimes(makeServerless('python3.13', { fn: {} })),
    ).not.toThrow()
  })

  it('accepts a mixed nodejs* + python3.x service', () => {
    const sls = makeServerless('nodejs20.x', {
      n: { runtime: 'nodejs22.x' },
      p: { runtime: 'python3.11' },
      q: { runtime: 'python3.13' },
    })
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('still rejects ruby, go, java with OFFLINE_UNSUPPORTED_RUNTIME', () => {
    const sls = makeServerless('nodejs20.x', {
      r: { runtime: 'ruby3.3' },
      g: { runtime: 'go1.x' },
      j: { runtime: 'java21' },
    })
    expect(() => assertSupportedRuntimes(sls)).toThrow(
      expect.objectContaining({ code: 'OFFLINE_UNSUPPORTED_RUNTIME' }),
    )
  })
})
