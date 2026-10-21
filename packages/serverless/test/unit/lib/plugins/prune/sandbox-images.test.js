import { jest, describe, it, expect } from '@jest/globals'
import {
  selectPruneVersionsForImage,
  listImageVersions,
  listInUseImageVersions,
} from '../../../../../lib/plugins/prune/sandbox-images.js'

const version = (imageVersion, createdAt, state = 'SUCCESSFUL') => ({
  imageVersion,
  createdAt: new Date(createdAt),
  state,
})

describe('selectPruneVersionsForImage', () => {
  const versions = [
    version('1.0', '2026-10-01T00:00:00Z'),
    version('2.0', '2026-10-02T00:00:00Z'),
    version('3.0', '2026-10-03T00:00:00Z'),
    version('4.0', '2026-10-04T00:00:00Z'),
  ]

  it('keeps the live version plus the N newest older versions', () => {
    const { candidates } = selectPruneVersionsForImage({
      versions,
      liveVersion: '4.0',
      inUseVersions: new Set(),
      number: 1,
    })
    expect(candidates).toEqual(['2.0', '1.0'])
  })

  it('never deletes the live version, even with number 0', () => {
    const { candidates } = selectPruneVersionsForImage({
      versions,
      liveVersion: '4.0',
      inUseVersions: new Set(),
      number: 0,
    })
    expect(candidates).toEqual(['3.0', '2.0', '1.0'])
  })

  it('keeps the live version when it is not the newest', () => {
    const { candidates } = selectPruneVersionsForImage({
      versions,
      liveVersion: '2.0',
      inUseVersions: new Set(),
      number: 0,
    })
    expect(candidates).toEqual(['4.0', '3.0', '1.0'])
  })

  it('orders by creation time, not by the version string', () => {
    const { candidates } = selectPruneVersionsForImage({
      versions: [
        version('9.0', '2026-10-01T00:00:00Z'),
        version('10.0', '2026-10-02T00:00:00Z'),
        version('11.0', '2026-10-03T00:00:00Z'),
      ],
      liveVersion: '11.0',
      inUseVersions: new Set(),
      number: 1,
    })
    expect(candidates).toEqual(['9.0'])
  })

  it('retains versions that MicroVMs still use, without counting them', () => {
    const { candidates, retained } = selectPruneVersionsForImage({
      versions,
      liveVersion: '4.0',
      inUseVersions: new Set(['3.0']),
      number: 1,
    })
    expect(candidates).toEqual(['1.0'])
    expect(retained).toEqual([{ version: '3.0', reason: 'in use' }])
  })

  it('skips versions that are still building', () => {
    const { candidates, retained } = selectPruneVersionsForImage({
      versions: [
        ...versions,
        version('5.0', '2026-10-05T00:00:00Z', 'IN_PROGRESS'),
        version('6.0', '2026-10-06T00:00:00Z', 'PENDING'),
      ],
      liveVersion: '4.0',
      inUseVersions: new Set(),
      number: 0,
    })
    expect(candidates).toEqual(['3.0', '2.0', '1.0'])
    expect(retained).toEqual([
      { version: '6.0', reason: 'building' },
      { version: '5.0', reason: 'building' },
    ])
  })

  it('deletes failed versions without counting them toward N', () => {
    const { candidates } = selectPruneVersionsForImage({
      versions: [
        version('1.0', '2026-10-01T00:00:00Z'),
        version('2.0', '2026-10-02T00:00:00Z', 'FAILED'),
        version('3.0', '2026-10-03T00:00:00Z'),
        version('4.0', '2026-10-04T00:00:00Z'),
      ],
      liveVersion: '4.0',
      inUseVersions: new Set(),
      number: 2,
    })
    expect(candidates).toEqual(['2.0'])
  })

  it('ignores versions that are already being deleted', () => {
    const { candidates, retained } = selectPruneVersionsForImage({
      versions: [
        version('1.0', '2026-10-01T00:00:00Z', 'DELETING'),
        version('2.0', '2026-10-02T00:00:00Z'),
      ],
      liveVersion: '2.0',
      inUseVersions: new Set(),
      number: 0,
    })
    expect(candidates).toEqual([])
    expect(retained).toEqual([])
  })

  it('deletes nothing when the image has no live version', () => {
    const { candidates } = selectPruneVersionsForImage({
      versions,
      liveVersion: undefined,
      inUseVersions: new Set(),
      number: 0,
    })
    expect(candidates).toEqual([])
  })
})

describe('listImageVersions', () => {
  it('follows nextToken across pages', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        items: [{ imageVersion: '1.0' }],
        nextToken: 't',
      })
      .mockResolvedValueOnce({ items: [{ imageVersion: '2.0' }] })
    const provider = { request }

    const items = await listImageVersions(provider, 'arn:image')

    expect(items.map((i) => i.imageVersion)).toEqual(['1.0', '2.0'])
    expect(request).toHaveBeenNthCalledWith(
      1,
      'LambdaMicrovms',
      'listMicrovmImageVersions',
      { imageIdentifier: 'arn:image' },
      { sdkVersion: 3 },
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      'LambdaMicrovms',
      'listMicrovmImageVersions',
      { imageIdentifier: 'arn:image', nextToken: 't' },
      { sdkVersion: 3 },
    )
  })
})

describe('listInUseImageVersions', () => {
  it('collects versions of MicroVMs that are not terminated', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        items: [
          { imageVersion: '1.0', state: 'RUNNING' },
          { imageVersion: '2.0', state: 'TERMINATED' },
          { imageVersion: '3.0', state: 'SUSPENDED' },
        ],
        nextToken: 'n',
      })
      .mockResolvedValueOnce({
        items: [
          { imageVersion: '4.0', state: 'TERMINATING' },
          { imageVersion: '5.0', state: 'PENDING' },
          { imageVersion: '6.0', state: 'SUSPENDING' },
        ],
      })

    const inUse = await listInUseImageVersions({ request }, 'arn:image')

    expect([...inUse].sort()).toEqual(['1.0', '3.0', '5.0', '6.0'])
    expect(request).toHaveBeenNthCalledWith(
      1,
      'LambdaMicrovms',
      'listMicrovms',
      { imageIdentifier: 'arn:image' },
      { sdkVersion: 3 },
    )
  })
})
