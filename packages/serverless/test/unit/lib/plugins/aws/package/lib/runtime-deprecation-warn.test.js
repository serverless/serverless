import { describe, expect, it, jest } from '@jest/globals'

// warnDeprecatedRuntimes reads the service the way packaging sees it: image
// functions carry their runtime in the image, and a runtime set on neither the
// function nor the provider is the Framework's default.
const warning = jest.fn()
jest.unstable_mockModule('@serverless/util', () => ({ log: { warning } }))

const { warnDeprecatedRuntimes } =
  await import('../../../../../../../lib/plugins/aws/package/lib/runtime-deprecation.js')

const DEFAULT_RUNTIME = 'nodejs20.x'
const now = new Date('2026-09-23T12:00:00Z')

const build = ({ providerRuntime, functions }) => ({
  serverless: {
    service: {
      provider: { ...(providerRuntime && { runtime: providerRuntime }) },
      getAllFunctions: () => Object.keys(functions),
      getFunction: (name) => functions[name],
    },
  },
  provider: {
    getRuntime: (runtime) => runtime || providerRuntime || DEFAULT_RUNTIME,
  },
})

describe('warnDeprecatedRuntimes', () => {
  it('warns once per deprecated runtime, skipping image functions', () => {
    warning.mockClear()
    warnDeprecatedRuntimes({
      ...build({
        providerRuntime: 'nodejs20.x',
        functions: {
          api: { handler: 'api.handler' },
          worker: { handler: 'worker.handler', runtime: 'python3.9' },
          modern: { handler: 'modern.handler', runtime: 'nodejs24.x' },
          container: { image: 'repo/image:latest', runtime: 'python3.9' },
        },
      }),
      now,
    })
    expect(warning).toHaveBeenCalledTimes(2)
    const [node, python] = warning.mock.calls.map(([text]) => text)
    expect(node).toMatch(/^Function "api" uses nodejs20\.x, which/)
    expect(python).toMatch(/^Function "worker" uses python3\.9, which/)
    expect(python).not.toContain('container')
  })

  it('says the runtime is the default only when neither the function nor the provider sets one', () => {
    warning.mockClear()
    warnDeprecatedRuntimes({
      ...build({ functions: { api: { handler: 'api.handler' } } }),
      now,
    })
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'uses nodejs20.x (the default when no runtime is set)',
      ),
    )

    warning.mockClear()
    warnDeprecatedRuntimes({
      ...build({
        providerRuntime: 'nodejs20.x',
        functions: { api: { handler: 'api.handler' } },
      }),
      now,
    })
    expect(warning.mock.calls[0][0]).not.toContain('the default')
  })

  it('stays quiet for a service on supported runtimes', () => {
    warning.mockClear()
    warnDeprecatedRuntimes({
      ...build({
        providerRuntime: 'nodejs24.x',
        functions: { api: { handler: 'api.handler' } },
      }),
      now,
    })
    expect(warning).not.toHaveBeenCalled()
  })
})
