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
    const sls = makeServerless('go1.x', {
      myFn: {},
      otherFn: {},
    })
    expect(() => assertSupportedRuntimes(sls)).toThrow(
      expect.objectContaining({ code: 'OFFLINE_UNSUPPORTED_RUNTIME' }),
    )
  })

  it('lists every offending function and its runtime in the error message', () => {
    const sls = makeServerless('go1.x', {
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
    expect(error.message).toContain('go1.x')
    expect(error.message).toContain('otherFn')
  })

  it('function-level supported runtime override makes that function pass even with unsupported provider', () => {
    // otherFn inherits go1.x → still throws; nodeOnlyFn is fine on its own
    const sls = makeServerless('go1.x', {
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
    // The go function must appear
    expect(error.message).toContain('otherFn')
  })

  it('throws for a function-level unsupported override even when provider runtime is supported', () => {
    const sls = makeServerless('nodejs20.x', {
      goodFn: {},
      badFn: { runtime: 'go1.x' },
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
    expect(error.message).toContain('go1.x')
    expect(error.message).not.toContain('goodFn')
  })

  it('lists multiple offenders with different unsupported runtimes in one error', () => {
    const sls = makeServerless('nodejs20.x', {
      goFn: { runtime: 'go1.x' },
      javaFn: { runtime: 'java21' },
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
    expect(error.message).toContain('javaFn')
    expect(error.message).toContain('java21')
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
    const sls = makeServerless('go1.x', { fn: {} })
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

  // M5c additions — ruby3.x is now a supported runtime family.
  it('accepts ruby3.3 as a valid Ruby runtime', () => {
    const sls = makeServerless('ruby3.3', { fn: {} })
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('accepts ruby3.2 and ruby3.4', () => {
    expect(() =>
      assertSupportedRuntimes(makeServerless('ruby3.2', { fn: {} })),
    ).not.toThrow()
    expect(() =>
      assertSupportedRuntimes(makeServerless('ruby3.4', { fn: {} })),
    ).not.toThrow()
  })

  it('accepts a mixed nodejs* + python3.x + ruby3.x service', () => {
    const sls = makeServerless('nodejs20.x', {
      n: { runtime: 'nodejs22.x' },
      p: { runtime: 'python3.11' },
      r: { runtime: 'ruby3.3' },
    })
    expect(() => assertSupportedRuntimes(sls)).not.toThrow()
  })

  it('still rejects go, java with OFFLINE_UNSUPPORTED_RUNTIME', () => {
    const sls = makeServerless('nodejs20.x', {
      g: { runtime: 'go1.x' },
      j: { runtime: 'java21' },
    })
    expect(() => assertSupportedRuntimes(sls)).toThrow(
      expect.objectContaining({ code: 'OFFLINE_UNSUPPORTED_RUNTIME' }),
    )
  })
})
