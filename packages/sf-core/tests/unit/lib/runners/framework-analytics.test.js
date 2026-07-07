import {
  tallyResourceTypes,
  deriveEventSourceTypes,
  countUniqueLayers,
  collectArtifactPaths,
  deriveAnalysisEnrichment,
} from '../../../../src/lib/runners/framework-analytics.js'

describe('tallyResourceTypes', () => {
  test('tallies AWS resource types verbatim', () => {
    expect(
      tallyResourceTypes({
        A: { Type: 'AWS::S3::Bucket' },
        B: { Type: 'AWS::S3::Bucket' },
        C: { Type: 'AWS::SQS::Queue' },
      }),
    ).toEqual({ 'AWS::S3::Bucket': 2, 'AWS::SQS::Queue': 1 })
  })

  test('collapses open-ended namespaces to closed keys', () => {
    expect(
      tallyResourceTypes({
        A: { Type: 'Custom::MySpecialThing' },
        B: { Type: 'Custom::OtherThing' },
        C: { Type: 'MongoDB::Atlas::Cluster' },
        D: { Type: 7 },
        E: {},
      }),
    ).toEqual({ Custom: 2, other: 1, unknown: 2 })
  })

  test('returns undefined for missing/empty/non-object input', () => {
    expect(tallyResourceTypes(undefined)).toBeUndefined()
    expect(tallyResourceTypes(null)).toBeUndefined()
    expect(tallyResourceTypes({})).toBeUndefined()
    expect(tallyResourceTypes([])).toBeUndefined()
    expect(tallyResourceTypes('nope')).toBeUndefined()
  })

  test('caps distinct keys at 50 with overflow under other', () => {
    const resources = {}
    for (let i = 0; i < 55; i += 1) {
      resources[`R${i}`] = { Type: `AWS::Fake::Type${i}` }
    }
    const tally = tallyResourceTypes(resources)
    expect(Object.keys(tally)).toHaveLength(51)
    expect(tally.other).toBe(5)
  })
})

describe('deriveEventSourceTypes', () => {
  test('collects unique sorted event types across functions', () => {
    expect(
      deriveEventSourceTypes({
        a: { events: [{ http: { path: '/', method: 'get' } }, { sqs: 'arn' }] },
        b: { events: [{ http: 'GET /x' }, { schedule: 'rate(1 hour)' }] },
      }),
    ).toEqual(['http', 'schedule', 'sqs'])
  })

  test('supports string events and tolerates malformed shapes', () => {
    expect(
      deriveEventSourceTypes({
        a: { events: ['schedule', {}, null] },
        b: { events: 'not-an-array' },
        c: {},
        d: null,
      }),
    ).toEqual(['schedule'])
    expect(deriveEventSourceTypes(undefined)).toEqual([])
  })
})

describe('countUniqueLayers', () => {
  test('counts defined layers plus unique string ARN references', () => {
    expect(
      countUniqueLayers({
        layers: { myLayer: { path: 'layer' } },
        provider: { layers: ['arn:aws:lambda:us-east-1:1:layer:ext:1'] },
        functions: {
          a: {
            layers: [
              'arn:aws:lambda:us-east-1:1:layer:ext:1', // dupe of provider ref
              { Ref: 'MyLayerLambdaLayer' }, // points at defined layer, skipped
            ],
          },
        },
      }),
    ).toBe(2)
  })

  test('returns 0 for empty/malformed config', () => {
    expect(countUniqueLayers(undefined)).toBe(0)
    expect(countUniqueLayers({})).toBe(0)
    expect(countUniqueLayers({ layers: null, provider: { layers: 'x' } })).toBe(
      0,
    )
  })
})

describe('collectArtifactPaths', () => {
  test('collects service and per-function artifacts, deduplicated', () => {
    expect(
      collectArtifactPaths({
        package: { artifact: '/x/service.zip' },
        functions: {
          a: { package: { artifact: '/x/a.zip' } },
          b: { package: { artifact: '/x/a.zip' } },
          c: {},
        },
      }),
    ).toEqual(['/x/service.zip', '/x/a.zip'])
  })

  test('returns empty array when nothing is packaged', () => {
    expect(collectArtifactPaths(undefined)).toEqual([])
    expect(collectArtifactPaths({ functions: {} })).toEqual([])
  })
})

describe('deriveAnalysisEnrichment', () => {
  const fullInput = {
    config: {
      provider: { architecture: 'arm64' },
      functions: {
        a: { events: [{ httpApi: { path: '/', method: 'get' } }] },
        b: { events: [{ sqs: 'arn' }] },
      },
      layers: { l1: {} },
      resources: {
        Resources: {
          Bucket: { Type: 'AWS::S3::Bucket' },
          Thing: { Type: 'Custom::Thing' },
        },
      },
    },
    compiledCloudFormationTemplate: {
      Resources: {
        F: { Type: 'AWS::Lambda::Function' },
        R: { Type: 'AWS::IAM::Role' },
      },
    },
    command: ['deploy'],
    serviceUniqueId: 'arn:aws:cloudformation:...',
    analyticsMetrics: {
      stackExistedBeforeRun: false,
      buildDurationMs: 1234,
      artifactSizesBytes: [5000, 678],
    },
  }

  test('derives all fields from a full input', () => {
    expect(deriveAnalysisEnrichment(fullInput)).toEqual({
      lambdaArchitecture: 'arm64',
      functionCount: 2,
      layerCount: 1,
      eventSourceTypes: ['httpApi', 'sqs'],
      configResourceTypeBreakdown: { 'AWS::S3::Bucket': 1, Custom: 1 },
      resourceTypeBreakdown: {
        'AWS::Lambda::Function': 1,
        'AWS::IAM::Role': 1,
      },
      resourceCount: 2,
      isFirstDeploy: true,
      buildDurationMs: 1234,
      artifactSizesBytes: [5000, 678],
    })
  })

  test('isFirstDeploy is false when stack existed, absent for non-deploy commands', () => {
    expect(
      deriveAnalysisEnrichment({
        ...fullInput,
        analyticsMetrics: {
          ...fullInput.analyticsMetrics,
          stackExistedBeforeRun: true,
        },
      }).isFirstDeploy,
    ).toBe(false)
    expect(
      deriveAnalysisEnrichment({ ...fullInput, command: ['print'] })
        .isFirstDeploy,
    ).toBeUndefined()
    expect(
      deriveAnalysisEnrichment({ ...fullInput, command: ['deploy', 'list'] })
        .isFirstDeploy,
    ).toBeUndefined()
    expect(
      deriveAnalysisEnrichment({
        ...fullInput,
        command: ['deploy', 'function'],
      }).isFirstDeploy,
    ).toBeUndefined()
    expect(
      deriveAnalysisEnrichment({ ...fullInput, serviceUniqueId: null })
        .isFirstDeploy,
    ).toBeUndefined()
  })

  test('defaults architecture and omits unavailable fields on minimal input', () => {
    expect(deriveAnalysisEnrichment({ config: {} })).toEqual({
      lambdaArchitecture: 'x86_64',
      functionCount: 0,
      layerCount: 0,
    })
  })

  test('never throws on hostile input', () => {
    const hostile = [
      {},
      undefined,
      { config: null },
      { config: { functions: 'x', layers: 7, resources: { Resources: [] } } },
      { config: { provider: 'aws' }, compiledCloudFormationTemplate: 'tpl' },
      { command: 'deploy', analyticsMetrics: null },
      { analyticsMetrics: { artifactSizesBytes: 'big' } },
    ]
    for (const input of hostile) {
      expect(() => deriveAnalysisEnrichment(input)).not.toThrow()
    }
  })
})
