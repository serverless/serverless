import { buildFunctionNameMap } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/lambda-invoke/name-map.js'

function makeServerless(functions) {
  return { service: { functions } }
}

describe('buildFunctionNameMap', () => {
  it('maps each function deployed name to its functionKey', () => {
    const map = buildFunctionNameMap(
      makeServerless({
        worker: { name: 'svc-dev-worker', handler: 'h.worker' },
        api: { name: 'svc-dev-api', handler: 'h.api' },
      }),
    )
    expect(map.get('svc-dev-worker')).toBe('worker')
    expect(map.get('svc-dev-api')).toBe('api')
    expect(map.size).toBe(2)
  })

  it('honors an explicit name override verbatim', () => {
    const map = buildFunctionNameMap(
      makeServerless({
        worker: { name: 'totally-custom-name', handler: 'h.worker' },
      }),
    )
    expect(map.get('totally-custom-name')).toBe('worker')
  })

  it('skips functions with no resolved name', () => {
    const map = buildFunctionNameMap(
      makeServerless({
        worker: { handler: 'h.worker' },
      }),
    )
    expect(map.size).toBe(0)
  })

  it('returns an empty map when there are no functions', () => {
    expect(buildFunctionNameMap(makeServerless({})).size).toBe(0)
    expect(buildFunctionNameMap({ service: {} }).size).toBe(0)
  })

  it('throws OFFLINE_DUPLICATE_FUNCTION_NAME on colliding name overrides', () => {
    expect(() =>
      buildFunctionNameMap(
        makeServerless({
          a: { name: 'dup', handler: 'h.a' },
          b: { name: 'dup', handler: 'h.b' },
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: 'OFFLINE_DUPLICATE_FUNCTION_NAME' }),
    )
  })
})
