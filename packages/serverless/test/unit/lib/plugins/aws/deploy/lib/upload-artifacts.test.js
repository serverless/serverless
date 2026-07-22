import { describe, it, expect, jest } from '@jest/globals'
import path from 'path'

jest.unstable_mockModule('@serverless/util', () => ({
  log: { info: jest.fn() },
  progress: { get: jest.fn(() => ({ notice: jest.fn(), remove: jest.fn() })) },
}))

const uploadArtifactsMixin = (
  await import('../../../../../../../lib/plugins/aws/deploy/lib/upload-artifacts.js')
).default

describe('uploadFunctionsAndLayers', () => {
  // This is the mechanism reference code storage mode depends on end-to-end:
  // uploadArtifacts() feeds this method's returned map straight into
  // patchReferenceObjectVersions(artifactVersionIds), which throws if a
  // REFERENCE resource's basename is missing from the map. A bug here (wrong
  // key, dropped entry, wrong VersionId) would silently break every
  // reference-mode deploy's version pinning.
  it('builds the artifactVersionIds map keyed by basename, from functions, layers, and agent artifacts', async () => {
    const uploadedFilenames = []
    const ctx = {
      ...uploadArtifactsMixin,
      serverless: {
        service: {
          package: { artifactDirectoryName: 'serverless/svc/dev/123' },
        },
      },
      getFunctionArtifactFilePaths: async () => [
        '/tmp/hello.zip',
        '/tmp/world.zip',
      ],
      getLayerArtifactFilePaths: () => ['/tmp/common.zip'],
      getAgentArtifactFilePaths: () => ['/tmp/agent.zip'],
      getFileStats: async () => ({ size: 10 }),
      uploadZipFile: jest.fn(async ({ filename }) => {
        uploadedFilenames.push(filename)
        return { VersionId: `v-${path.basename(filename)}` }
      }),
    }

    const result = await ctx.uploadFunctionsAndLayers()

    expect(result).toEqual({
      'hello.zip': 'v-hello.zip',
      'world.zip': 'v-world.zip',
      'common.zip': 'v-common.zip',
      'agent.zip': 'v-agent.zip',
    })
    expect(uploadedFilenames.sort()).toEqual(
      [
        '/tmp/hello.zip',
        '/tmp/world.zip',
        '/tmp/common.zip',
        '/tmp/agent.zip',
      ].sort(),
    )
    // Every upload is keyed under the service's artifact directory.
    expect(ctx.uploadZipFile).toHaveBeenCalledWith(
      expect.objectContaining({ s3KeyDirname: 'serverless/svc/dev/123' }),
    )
  })

  it('drops entries whose upload returned no VersionId (unversioned bucket)', async () => {
    const ctx = {
      ...uploadArtifactsMixin,
      serverless: {
        service: {
          package: { artifactDirectoryName: 'serverless/svc/dev/123' },
        },
      },
      getFunctionArtifactFilePaths: async () => [
        '/tmp/hello.zip',
        '/tmp/unversioned.zip',
      ],
      getLayerArtifactFilePaths: () => [],
      getAgentArtifactFilePaths: () => [],
      getFileStats: async () => ({ size: 10 }),
      uploadZipFile: jest.fn(async ({ filename }) => {
        if (filename === '/tmp/unversioned.zip') return {}
        return { VersionId: 'v-hello.zip' }
      }),
    }

    const result = await ctx.uploadFunctionsAndLayers()

    expect(result).toEqual({ 'hello.zip': 'v-hello.zip' })
    expect(result['unversioned.zip']).toBeUndefined()
  })
})

describe('getFileStats', () => {
  it('wraps an unreadable artifact path in a ServerlessError', async () => {
    await expect(
      uploadArtifactsMixin.getFileStats('/does/not/exist.zip'),
    ).rejects.toMatchObject({
      code: 'INACCESSIBLE_FILE_ARTIFACT',
      message: expect.stringContaining('/does/not/exist.zip'),
    })
  })
})
