import { describe, it, expect, jest } from '@jest/globals'

const {
  buildPinnedShaSet,
  collectLayerArns,
  layerBasenameFromArn,
  sweepArtifacts,
} = await import('../../../../../lib/plugins/prune/artifact-sweep.js')

describe('pin set helpers', () => {
  it('buildPinnedShaSet unions CodeSha256 across functions', () => {
    const set = buildPinnedShaSet([
      [{ CodeSha256: 'aaa' }, { CodeSha256: 'bbb' }],
      [{ CodeSha256: 'ccc' }],
    ])
    expect([...set].sort()).toEqual(['aaa', 'bbb', 'ccc'])
  })

  it('collectLayerArns unions attached and surviving layer version arns', () => {
    const arns = collectLayerArns(
      [[{ Layers: [{ Arn: 'arn:aws:lambda:r:a:layer:shared:3' }] }]],
      [[{ LayerVersionArn: 'arn:aws:lambda:r:a:layer:common:1' }]],
    )
    expect([...arns].sort()).toEqual([
      'arn:aws:lambda:r:a:layer:common:1',
      'arn:aws:lambda:r:a:layer:shared:3',
    ])
  })

  it('layerBasenameFromArn extracts the layer artifact basename', () => {
    expect(
      layerBasenameFromArn('arn:aws:lambda:us-east-1:111:layer:common:7'),
    ).toBe('common.zip')
  })
})

// Real S3 listObjectsV2 returns keys in lexicographic ASCENDING order, so
// for timestamped deployment directories that means oldest first, newest
// last (see cleanup-s3-bucket.js's slice(0, -keepCount) precedent).
const listing = {
  Contents: [
    // candidates (oldest, outside the keepCount:2 retention window)
    { Key: 'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip' },
    { Key: 'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip' },
    {
      Key: 'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/compiled-cloudformation-template.json',
    },
    // newest 2 dirs (within keepCount window)
    { Key: 'serverless/svc/dev/200-2026-07-16T00:00:00.000Z/svc.zip' },
    { Key: 'serverless/svc/dev/300-2026-07-17T00:00:00.000Z/svc.zip' },
  ],
}

const buildProvider = ({ shaByKey }) => ({
  request: jest.fn(async (service, method, params) => {
    if (method === 'listObjectsV2') return listing
    if (method === 'headObject')
      return {
        Metadata: { filesha256: shaByKey[params.Key] },
        VersionId: `vid-${params.Key}`,
      }
    if (method === 'deleteObjects') return {}
    throw new Error(`unexpected ${method}`)
  }),
})

const baseCtx = (provider, overrides = {}) => ({
  provider,
  bucketName: 'bucket',
  deploymentPrefix: 'serverless',
  service: 'svc',
  stage: 'dev',
  keepCount: 2,
  pinnedShas: new Set(),
  layerPins: new Map(),
  layerBasenameFailSafePins: new Set(),
  dryRun: false,
  ...overrides,
})

describe('sweepArtifacts', () => {
  it('marks unpinned candidate dirs and keeps pinned ones', async () => {
    const provider = buildProvider({
      shaByKey: {
        'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip': 'PINNED',
        'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip': 'garbage',
      },
    })
    const result = await sweepArtifacts(
      baseCtx(provider, { pinnedShas: new Set(['PINNED']) }),
    )
    expect(result.markedDirs).toEqual(['050-2026-07-14T00:00:00.000Z'])
    expect(result.keptDirs.map((d) => d.dir)).toEqual([
      '100-2026-07-15T00:00:00.000Z',
    ])
    const deleteCall = provider.request.mock.calls.find(
      ([, m]) => m === 'deleteObjects',
    )
    expect(deleteCall[2].Delete.Objects).toEqual([
      { Key: 'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip' },
    ])
    // marker-only: no VersionId in any delete object
    expect(
      deleteCall[2].Delete.Objects.every((o) => o.VersionId === undefined),
    ).toBe(true)
  })

  it('never touches dirs within the keep window', async () => {
    // With the empty shaByKey fixture, every candidate dir has zip entries
    // with no filesha256 metadata, so all candidates are fail-safe pinned
    // (kept) — nothing is ever marked, so no deleteObjects call is made at
    // all under (3)'s "only call when there's something to mark" gate.
    const provider = buildProvider({ shaByKey: {} })
    await sweepArtifacts(baseCtx(provider))
    expect(
      provider.request.mock.calls.find(([, m]) => m === 'deleteObjects'),
    ).toBeUndefined()
  })

  it('selects the oldest dirs outside the keep window (ordering semantics)', async () => {
    // Ascending listing order (real S3 semantics), keepCount: 2, and no
    // pins — every candidate's sha is present but garbage. This locks in
    // that candidates are the OLDEST dirs (groups.slice(0, -keepCount)),
    // never the newest.
    const provider = buildProvider({
      shaByKey: {
        'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip': 'garbage',
        'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip': 'garbage',
      },
    })
    const result = await sweepArtifacts(baseCtx(provider))
    expect([...result.markedDirs].sort()).toEqual([
      '050-2026-07-14T00:00:00.000Z',
      '100-2026-07-15T00:00:00.000Z',
    ])
    const deleteCall = provider.request.mock.calls.find(
      ([, m]) => m === 'deleteObjects',
    )
    const keys = deleteCall[2].Delete.Objects.map((o) => o.Key)
    expect(keys.some((k) => k.includes('200-'))).toBe(false)
    expect(keys.some((k) => k.includes('300-'))).toBe(false)
  })

  it('treats missing filesha256 metadata as pinned', async () => {
    const provider = buildProvider({ shaByKey: {} }) // no metadata for anything
    const result = await sweepArtifacts(baseCtx(provider))
    // dirs containing zips without metadata are kept…
    expect(result.markedDirs).not.toContain('100-2026-07-15T00:00:00.000Z')
  })

  it('pins by exact layer key/version', async () => {
    const provider = buildProvider({
      shaByKey: {
        'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip': 'garbage',
        'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip': 'garbage',
      },
    })
    const layerPins = new Map([
      [
        'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip',
        'vid-serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip',
      ],
    ])
    const result = await sweepArtifacts(baseCtx(provider, { layerPins }))
    expect(result.markedDirs).toEqual(['050-2026-07-14T00:00:00.000Z'])
  })

  it('pins by layer basename fail-safe', async () => {
    const provider = buildProvider({
      shaByKey: {
        'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip': 'garbage',
        'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip': 'garbage',
      },
    })
    const result = await sweepArtifacts(
      baseCtx(provider, { layerBasenameFailSafePins: new Set(['svc.zip']) }),
    )
    expect(result.markedDirs).toEqual([])
  })

  it('reports without deleting on dryRun', async () => {
    const provider = buildProvider({
      shaByKey: {
        'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip': 'garbage',
        'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip': 'garbage',
      },
    })
    const result = await sweepArtifacts(baseCtx(provider, { dryRun: true }))
    expect(result.markedDirs.length).toBe(2)
    expect(
      provider.request.mock.calls.find(([, m]) => m === 'deleteObjects'),
    ).toBeUndefined()
  })

  it('aggregates paginated listObjectsV2 results before selecting candidates', async () => {
    // First page only covers the 050 and 100 dirs and is truncated; the
    // second page (fetched with the returned ContinuationToken) covers the
    // 200 and 300 dirs. This locks that a truncated first page can never
    // shift the keep-window boundary — candidates must be computed from the
    // FULL aggregated listing, not from whichever page happened to be seen
    // first.
    const page1Contents = [
      { Key: 'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip' },
      { Key: 'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip' },
      {
        Key: 'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/compiled-cloudformation-template.json',
      },
    ]
    const page2Contents = [
      { Key: 'serverless/svc/dev/200-2026-07-16T00:00:00.000Z/svc.zip' },
      { Key: 'serverless/svc/dev/300-2026-07-17T00:00:00.000Z/svc.zip' },
    ]
    const shaByKey = {
      'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip': 'garbage',
      'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip': 'garbage',
    }
    const provider = {
      request: jest.fn(async (service, method, params) => {
        if (method === 'listObjectsV2') {
          if (!params.ContinuationToken) {
            return {
              Contents: page1Contents,
              IsTruncated: true,
              NextContinuationToken: 'page2',
            }
          }
          expect(params.ContinuationToken).toBe('page2')
          return { Contents: page2Contents, IsTruncated: false }
        }
        if (method === 'headObject')
          return {
            Metadata: { filesha256: shaByKey[params.Key] },
            VersionId: `vid-${params.Key}`,
          }
        if (method === 'deleteObjects') return {}
        throw new Error(`unexpected ${method}`)
      }),
    }

    const result = await sweepArtifacts(baseCtx(provider))

    const listCalls = provider.request.mock.calls.filter(
      ([, m]) => m === 'listObjectsV2',
    )
    expect(listCalls.length).toBe(2)
    expect([...result.markedDirs].sort()).toEqual([
      '050-2026-07-14T00:00:00.000Z',
      '100-2026-07-15T00:00:00.000Z',
    ])
    const deleteCall = provider.request.mock.calls.find(
      ([, m]) => m === 'deleteObjects',
    )
    const keys = deleteCall[2].Delete.Objects.map((o) => o.Key)
    expect(keys.some((k) => k.includes('200-'))).toBe(false)
    expect(keys.some((k) => k.includes('300-'))).toBe(false)
  })

  it("layer pin with null version pins the key regardless of the object's current version", async () => {
    const provider = buildProvider({
      shaByKey: {
        'serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip': 'garbage',
        'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/svc.zip': 'garbage',
      },
    })
    const layerPins = new Map([
      ['serverless/svc/dev/100-2026-07-15T00:00:00.000Z/svc.zip', null],
    ])
    const result = await sweepArtifacts(baseCtx(provider, { layerPins }))
    expect(result.keptDirs.map((d) => d.dir)).toContain(
      '100-2026-07-15T00:00:00.000Z',
    )
    expect(result.markedDirs).not.toContain('100-2026-07-15T00:00:00.000Z')
  })

  it('keeps a candidate dir with no .zip artifacts at all (fail-safe pin)', async () => {
    // Oldest candidate dir has ONLY a non-artifact file (e.g. the compiled
    // template) — nothing to prove unpinned against, so uncertainty keeps it.
    const listingNoZip = {
      Contents: [
        {
          Key: 'serverless/svc/dev/050-2026-07-14T00:00:00.000Z/compiled-cloudformation-template.json',
        },
        { Key: 'serverless/svc/dev/200-2026-07-16T00:00:00.000Z/svc.zip' },
        { Key: 'serverless/svc/dev/300-2026-07-17T00:00:00.000Z/svc.zip' },
      ],
    }
    const provider = {
      request: jest.fn(async (service, method) => {
        if (method === 'listObjectsV2') return listingNoZip
        throw new Error(`unexpected ${method}`)
      }),
    }
    const result = await sweepArtifacts(baseCtx(provider))
    expect(result.markedDirs).toEqual([])
    const kept = result.keptDirs.find(
      (d) => d.dir === '050-2026-07-14T00:00:00.000Z',
    )
    expect(kept).toBeDefined()
    expect(kept.reasons).toEqual([
      'no artifact files found in directory (fail-safe pin)',
    ])
    // Never even attempts to read an object that isn't there.
    expect(
      provider.request.mock.calls.some(([, m]) => m === 'headObject'),
    ).toBe(false)
  })

  it('keeps a candidate dir when headObject throws (fail-safe pin)', async () => {
    const provider = {
      request: jest.fn(async (service, method, params) => {
        if (method === 'listObjectsV2') return listing
        if (method === 'headObject') {
          if (params.Key.includes('050-')) {
            throw new Error('access denied')
          }
          return { Metadata: { filesha256: 'garbage' }, VersionId: 'vid' }
        }
        if (method === 'deleteObjects') return {}
        throw new Error(`unexpected ${method}`)
      }),
    }
    const result = await sweepArtifacts(baseCtx(provider))
    const kept = result.keptDirs.find(
      (d) => d.dir === '050-2026-07-14T00:00:00.000Z',
    )
    expect(kept).toBeDefined()
    expect(kept.reasons[0]).toMatch(/could not read .* kept \(fail-safe\)/)
    expect(result.markedDirs).not.toContain('050-2026-07-14T00:00:00.000Z')
  })
})
