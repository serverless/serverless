import { describe, it, expect } from '@jest/globals'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveFetchHandler } from '../../../../../../../lib/plugins/aws/mcp/entry/lib/interop.mjs'

const modulesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'modules',
)

describe('resolveFetchHandler', () => {
  const options = { serverModulePath: 'src/crm.js' }

  it('resolves the native-ESM shape { default: { fetch } }', () => {
    const handler = { fetch: () => {} }
    expect(resolveFetchHandler({ default: handler }, options)).toBe(handler)
  })

  // esbuild's CJS bundles land on `default` as module.exports, so the real
  // default export sits one level deeper.
  it('resolves the esbuild-CJS double-default shape to the inner object', () => {
    const handler = { fetch: () => {} }
    expect(
      resolveFetchHandler(
        { default: { default: handler, __esModule: true } },
        options,
      ),
    ).toBe(handler)
  })

  it('resolves a bare namespace that itself exposes fetch', () => {
    const ns = { fetch: () => {} }
    expect(resolveFetchHandler(ns, options)).toBe(ns)
  })

  it('prefers the outer default when it already exposes fetch', () => {
    const outer = { fetch: () => {}, default: { fetch: () => {} } }
    expect(resolveFetchHandler({ default: outer }, options)).toBe(outer)
  })

  // Candidate order is load-bearing: an esbuild CJS bundle re-exports the
  // whole module.exports on the namespace, so a bare `fetch` may sit next to
  // the real default export. The deeper default always wins.
  it('prefers the default export over a fetch on the namespace itself', () => {
    const ns = { fetch: () => {}, default: { fetch: () => {} } }
    expect(resolveFetchHandler(ns, options)).toBe(ns.default)
  })

  it('prefers the double-default export over a fetch on the namespace itself', () => {
    const ns = {
      fetch: () => {},
      default: { default: { fetch: () => {} }, __esModule: true },
    }
    expect(resolveFetchHandler(ns, options)).toBe(ns.default.default)
  })

  // The esbuild-CJS bag re-exports every name, so a module with a named
  // `fetch` export puts one right beside the real default. The `__esModule`
  // marker is what says "this is an export bag, not the export" — the inner
  // default must win.
  it('prefers the inner default over a named fetch on a marked export bag', () => {
    const inner = { fetch: () => {} }
    const ns = {
      default: { default: inner, fetch: () => {}, __esModule: true },
    }
    expect(resolveFetchHandler(ns, options)).toBe(inner)
  })

  // Transpiler interop shims install getters that can throw (e.g. a live
  // binding to a module that failed to initialise). A throwing candidate is
  // "not a match", not a crash.
  it('skips a candidate whose property access throws', () => {
    const ns = {
      fetch: () => {},
      get default() {
        throw new Error('live binding not initialised')
      },
    }
    expect(resolveFetchHandler(ns, options)).toBe(ns)
  })

  it('throws the teaching error when every candidate access throws', () => {
    const ns = new Proxy(
      {},
      {
        get() {
          throw new Error('live binding not initialised')
        },
      },
    )
    expect(() => resolveFetchHandler(ns, options)).toThrow(/server:/)
  })

  // The teaching error must not eat the module's own story: when a candidate
  // access threw, that error rides along as the cause.
  it('carries the swallowed access error as the cause of the teaching error', () => {
    const ns = new Proxy(
      {},
      {
        get() {
          throw new Error('live binding not initialised')
        },
      },
    )
    let thrown
    try {
      resolveFetchHandler(ns, options)
    } catch (error) {
      thrown = error
    }
    expect(thrown.cause).toBeInstanceOf(Error)
    expect(thrown.cause.message).toBe('live binding not initialised')
  })

  it('has no cause when nothing threw and simply no candidate matched', () => {
    let thrown
    try {
      resolveFetchHandler({ default: 42 }, options)
    } catch (error) {
      thrown = error
    }
    expect(thrown.cause).toBeUndefined()
  })

  it('throws a teaching error naming the server property and the module path', () => {
    expect(() => resolveFetchHandler({ default: 42 }, options)).toThrow(
      /server:/,
    )
    expect(() => resolveFetchHandler({ default: 42 }, options)).toThrow(
      /src\/crm\.js/,
    )
  })

  it('throws when fetch is not a function', () => {
    expect(() =>
      resolveFetchHandler({ default: { fetch: 'nope' } }, options),
    ).toThrow(/server:/)
  })

  it('throws when the namespace is missing entirely', () => {
    expect(() => resolveFetchHandler(undefined, options)).toThrow(/server:/)
  })
})

// The synthetic namespaces above pin the ordering rules; these pin that the
// rules hold for what `import()` ACTUALLY produces — the entry loads the user
// module with a dynamic import (`entry/index.mjs`), and Node's CJS/ESM interop
// shapes are easy to mis-imagine (hand-built objects are how a wrong-handler
// bug slipped past this file once).
describe('resolveFetchHandler over real modules', () => {
  const resolveFromFile = async (fileName) => {
    const ns = await import(pathToFileURL(path.join(modulesDir, fileName)).href)
    return resolveFetchHandler(ns, { serverModulePath: fileName })
  }

  const servedBody = async (handler) =>
    (await handler.fetch(new Request('https://example.com/'))).text()

  it.each([
    ['esm-default.mjs', 'esm-default'],
    ['esm-default-and-named-fetch.mjs', 'esm-real-default'],
    ['cjs-module-exports.cjs', 'cjs-module-exports'],
    ['cjs-transpiled-default.cjs', 'cjs-transpiled-default'],
    ['cjs-esbuild-bundle.cjs', 'REAL default export'],
  ])('resolves %s to its real handler', async (fileName, expectedBody) => {
    const handler = await resolveFromFile(fileName)
    await expect(servedBody(handler)).resolves.toBe(expectedBody)
  })
})
