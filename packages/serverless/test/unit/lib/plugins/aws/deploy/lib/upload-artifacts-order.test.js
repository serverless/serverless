import { describe, it, expect, beforeEach, jest } from '@jest/globals'

const uploadArtifactsMixin = (
  await import('../../../../../../../lib/plugins/aws/deploy/lib/upload-artifacts.js')
).default

const buildCtx = ({ referenceMode }) => {
  const calls = []
  return {
    ctx: {
      ...uploadArtifactsMixin,
      provider: { isReferenceCodeStorageMode: () => referenceMode },
      serverless: {
        service: {
          package: { artifactDirectoryName: 'serverless/svc/dev/123' },
          provider: {},
        },
        utils: { fileExistsSync: () => false },
      },
      getFunctionArtifactFilePaths: async () => ['/tmp/svc.zip'],
      getLayerArtifactFilePaths: () => [],
      getFileStats: async () => ({ size: 10 }),
      uploadCloudFormationFile: jest.fn(async () => calls.push('template')),
      uploadStateFile: jest.fn(async () => calls.push('state')),
      uploadFunctionsAndLayers: jest.fn(async () => {
        calls.push('zips')
        return { 'svc.zip': 'v1' }
      }),
      uploadCustomResources: jest.fn(async () => calls.push('custom')),
      patchReferenceObjectVersions: jest.fn(() => calls.push('patch')),
    },
    calls,
  }
}

describe('uploadArtifacts ordering', () => {
  it('keeps today’s order in copy mode and never patches', async () => {
    const { ctx, calls } = buildCtx({ referenceMode: false })
    await ctx.uploadArtifacts()
    expect(calls).toEqual(['template', 'state', 'zips', 'custom'])
    expect(ctx.patchReferenceObjectVersions).not.toHaveBeenCalled()
  })

  it('uploads zips first, patches, then uploads the template in reference mode', async () => {
    const { ctx, calls } = buildCtx({ referenceMode: true })
    await ctx.uploadArtifacts()
    expect(calls).toEqual(['zips', 'custom', 'patch', 'template', 'state'])
    expect(ctx.patchReferenceObjectVersions).toHaveBeenCalledWith({
      'svc.zip': 'v1',
    })
  })
})
