import {
  resolveFunctionLayers,
  uniqueLayerSets,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/runners/layers/layer-resolver.js'

const ARN_A = 'arn:aws:lambda:us-east-1:111122223333:layer:libA:3'
const ARN_B = 'arn:aws:lambda:us-east-1:111122223333:layer:libB:1'

function makeServerless({ functions, providerLayers } = {}) {
  return {
    service: {
      provider: providerLayers ? { layers: providerLayers } : {},
      functions: functions ?? {},
    },
  }
}

describe('resolveFunctionLayers', () => {
  it('keeps external ARN layers per function in declared order', () => {
    const { byFunction, skipped } = resolveFunctionLayers(
      makeServerless({
        functions: { api: { handler: 'h.api', layers: [ARN_A, ARN_B] } },
      }),
    )
    expect(byFunction.get('api')).toEqual([ARN_A, ARN_B])
    expect(skipped).toEqual([])
  })

  it('falls back to provider.layers when a function has none', () => {
    const { byFunction } = resolveFunctionLayers(
      makeServerless({
        providerLayers: [ARN_A],
        functions: { api: { handler: 'h.api' } },
      }),
    )
    expect(byFunction.get('api')).toEqual([ARN_A])
  })

  it('lets function.layers override provider.layers (no merge)', () => {
    const { byFunction } = resolveFunctionLayers(
      makeServerless({
        providerLayers: [ARN_A],
        functions: { api: { handler: 'h.api', layers: [ARN_B] } },
      }),
    )
    expect(byFunction.get('api')).toEqual([ARN_B])
  })

  it('records Ref (local) layers as skipped and excludes them', () => {
    const { byFunction, skipped } = resolveFunctionLayers(
      makeServerless({
        functions: {
          api: {
            handler: 'h.api',
            layers: [{ Ref: 'MyLayerLambdaLayer' }, ARN_A],
          },
        },
      }),
    )
    expect(byFunction.get('api')).toEqual([ARN_A])
    expect(skipped).toEqual([
      { functionKey: 'api', ref: { Ref: 'MyLayerLambdaLayer' } },
    ])
  })

  it('omits functions with no external-ARN layers from byFunction', () => {
    const { byFunction } = resolveFunctionLayers(
      makeServerless({
        functions: { plain: { handler: 'h.plain' } },
      }),
    )
    expect(byFunction.has('plain')).toBe(false)
    expect(byFunction.size).toBe(0)
  })
})

describe('uniqueLayerSets', () => {
  it('dedups identical ordered ARN lists to one stable set key', () => {
    const byFunction = new Map([
      ['a', [ARN_A, ARN_B]],
      ['b', [ARN_A, ARN_B]],
      ['c', [ARN_B]],
    ])
    const sets = uniqueLayerSets(byFunction)
    expect(sets.size).toBe(2)
    const values = [...sets.values()]
    expect(values).toContainEqual([ARN_A, ARN_B])
    expect(values).toContainEqual([ARN_B])
  })

  it('treats different ordering as different sets', () => {
    const sets = uniqueLayerSets(
      new Map([
        ['a', [ARN_A, ARN_B]],
        ['b', [ARN_B, ARN_A]],
      ]),
    )
    expect(sets.size).toBe(2)
  })
})
