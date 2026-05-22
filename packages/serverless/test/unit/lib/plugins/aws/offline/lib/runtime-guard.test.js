import { assertAllNodeRuntimes } from '../../../../../../../lib/plugins/aws/offline/lib/runtime-guard.js'

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

describe('assertAllNodeRuntimes', () => {
  it('does not throw when all functions use a Node provider runtime', () => {
    const sls = makeServerless('nodejs20.x', {
      hello: {},
      world: {},
    })
    expect(() => assertAllNodeRuntimes(sls)).not.toThrow()
  })

  it('does not throw when functions map is empty', () => {
    const sls = makeServerless('nodejs20.x', {})
    expect(() => assertAllNodeRuntimes(sls)).not.toThrow()
  })

  it('does not throw when functions is absent (undefined)', () => {
    const sls = {
      service: {
        provider: { runtime: 'nodejs20.x' },
        functions: undefined,
      },
    }
    expect(() => assertAllNodeRuntimes(sls)).not.toThrow()
  })

  it('throws when provider runtime is non-Node and no function overrides it', () => {
    const sls = makeServerless('python3.11', {
      myFn: {},
      otherFn: {},
    })
    expect(() => assertAllNodeRuntimes(sls)).toThrow(
      expect.objectContaining({ code: 'OFFLINE_UNSUPPORTED_RUNTIME' }),
    )
  })

  it('lists every offending function and its runtime in the error message', () => {
    const sls = makeServerless('python3.11', {
      myFn: {},
      otherFn: {},
    })
    let error
    try {
      assertAllNodeRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error.message).toContain('myFn')
    expect(error.message).toContain('python3.11')
    expect(error.message).toContain('otherFn')
  })

  it('function-level Node runtime override makes that function pass even with non-Node provider', () => {
    // otherFn inherits python3.11 → still throws; nodeOnlyFn is fine on its own
    const sls = makeServerless('python3.11', {
      nodeOnlyFn: { runtime: 'nodejs20.x' },
      otherFn: {},
    })
    let error
    try {
      assertAllNodeRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error).toBeDefined()
    expect(error.code).toBe('OFFLINE_UNSUPPORTED_RUNTIME')
    // The Node function must not appear in the error
    expect(error.message).not.toContain('nodeOnlyFn')
    // The python function must appear
    expect(error.message).toContain('otherFn')
  })

  it('throws for a function-level non-Node override even when provider runtime is Node', () => {
    const sls = makeServerless('nodejs20.x', {
      goodFn: {},
      badFn: { runtime: 'python3.11' },
    })
    let error
    try {
      assertAllNodeRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error).toBeDefined()
    expect(error.code).toBe('OFFLINE_UNSUPPORTED_RUNTIME')
    expect(error.message).toContain('badFn')
    expect(error.message).toContain('python3.11')
    expect(error.message).not.toContain('goodFn')
  })

  it('lists multiple offenders with different non-Node runtimes in one error', () => {
    const sls = makeServerless('nodejs20.x', {
      pyFn: { runtime: 'python3.11' },
      rubyFn: { runtime: 'ruby3.2' },
    })
    let error
    try {
      assertAllNodeRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error).toBeDefined()
    expect(error.message).toContain('pyFn')
    expect(error.message).toContain('python3.11')
    expect(error.message).toContain('rubyFn')
    expect(error.message).toContain('ruby3.2')
  })

  it('skips silently when both provider runtime and function runtime are undefined', () => {
    const sls = {
      service: {
        provider: {},
        functions: { myFn: {} },
      },
    }
    expect(() => assertAllNodeRuntimes(sls)).not.toThrow()
  })

  it('error code is OFFLINE_UNSUPPORTED_RUNTIME', () => {
    const sls = makeServerless('python3.11', { fn: {} })
    let error
    try {
      assertAllNodeRuntimes(sls)
    } catch (err) {
      error = err
    }
    expect(error.code).toBe('OFFLINE_UNSUPPORTED_RUNTIME')
  })

  it('accepts nodejs18.x as a valid Node runtime', () => {
    const sls = makeServerless('nodejs18.x', { fn: {} })
    expect(() => assertAllNodeRuntimes(sls)).not.toThrow()
  })

  it('accepts nodejs20.x as a valid Node runtime', () => {
    const sls = makeServerless('nodejs20.x', { fn: {} })
    expect(() => assertAllNodeRuntimes(sls)).not.toThrow()
  })

  it('accepts nodejs22.x as a valid Node runtime', () => {
    const sls = makeServerless('nodejs22.x', { fn: {} })
    expect(() => assertAllNodeRuntimes(sls)).not.toThrow()
  })

  it('accepts a bare nodejsN runtime without the .x suffix', () => {
    const sls = makeServerless('nodejs20', { fn: {} })
    expect(() => assertAllNodeRuntimes(sls)).not.toThrow()
  })
})
