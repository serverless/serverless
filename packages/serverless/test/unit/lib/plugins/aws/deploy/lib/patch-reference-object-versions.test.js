import { describe, it, expect, beforeEach } from '@jest/globals'

const patchMixin = (
  await import('../../../../../../../lib/plugins/aws/deploy/lib/patch-reference-object-versions.js')
).default

describe('patchReferenceObjectVersions', () => {
  let ctx

  beforeEach(() => {
    ctx = {
      ...patchMixin,
      provider: {
        naming: {
          getLambdaLayerLogicalId: (name) =>
            `${name[0].toUpperCase()}${name.slice(1)}LambdaLayer`,
          getLambdaLayerS3ObjectVersionOutputLogicalId: (name) =>
            `${name[0].toUpperCase()}${name.slice(1)}LambdaLayerS3ObjectVersion`,
        },
      },
      serverless: {
        service: {
          getAllLayers: () => ['common'],
          getLayer: () => ({}),
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                HelloLambdaFunction: {
                  Type: 'AWS::Lambda::Function',
                  Properties: {
                    Code: {
                      S3Bucket: 'bucket',
                      S3Key: 'serverless/svc/dev/123/svc.zip',
                      S3ObjectStorageMode: 'REFERENCE',
                    },
                  },
                },
                CopyModeLambdaFunction: {
                  Type: 'AWS::Lambda::Function',
                  Properties: {
                    Code: {
                      S3Bucket: 'bucket',
                      S3Key: 'serverless/svc/dev/123/svc.zip',
                    },
                  },
                },
                CommonLambdaLayer: {
                  Type: 'AWS::Lambda::LayerVersion',
                  Properties: {
                    Content: {
                      S3Bucket: 'bucket',
                      S3Key: 'serverless/svc/dev/123/common.zip',
                      S3ObjectStorageMode: 'REFERENCE',
                    },
                  },
                },
              },
              Outputs: {
                CommonLambdaLayerS3ObjectVersion: { Value: 'S3ObjectVersion' },
              },
            },
          },
        },
      },
    }
  })

  it('patches function Code and layer Content + output from the version map', () => {
    ctx.patchReferenceObjectVersions({
      'svc.zip': 'fnVersion1',
      'common.zip': 'layerVersion1',
    })
    const { Resources, Outputs } =
      ctx.serverless.service.provider.compiledCloudFormationTemplate
    expect(Resources.HelloLambdaFunction.Properties.Code.S3ObjectVersion).toBe(
      'fnVersion1',
    )
    expect(
      Resources.CopyModeLambdaFunction.Properties.Code.S3ObjectVersion,
    ).toBeUndefined()
    expect(Resources.CommonLambdaLayer.Properties.Content.S3ObjectVersion).toBe(
      'layerVersion1',
    )
    expect(Outputs.CommonLambdaLayerS3ObjectVersion.Value).toBe('layerVersion1')
  })

  it('skips layers whose artifact was reused from a previous deployment', () => {
    ctx.serverless.service.getLayer = () => ({ artifactAlreadyUploaded: true })
    ctx.serverless.service.provider.compiledCloudFormationTemplate.Resources.CommonLambdaLayer.Properties.Content.S3ObjectVersion =
      'reusedVersion'
    ctx.patchReferenceObjectVersions({ 'svc.zip': 'fnVersion1' })
    expect(
      ctx.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .CommonLambdaLayer.Properties.Content.S3ObjectVersion,
    ).toBe('reusedVersion')
  })

  it('skips a layer resource that is not in REFERENCE storage mode (copy-mode layer)', () => {
    // Copy-mode layer: no S3ObjectStorageMode on Content at all, and no
    // versionId provided for its artifact — must not throw and must not be
    // touched, even though the layer is still registered in the service.
    delete ctx.serverless.service.provider.compiledCloudFormationTemplate
      .Resources.CommonLambdaLayer.Properties.Content.S3ObjectStorageMode
    expect(() =>
      ctx.patchReferenceObjectVersions({ 'svc.zip': 'fnVersion1' }),
    ).not.toThrow()
    const { Resources, Outputs } =
      ctx.serverless.service.provider.compiledCloudFormationTemplate
    expect(
      Resources.CommonLambdaLayer.Properties.Content.S3ObjectVersion,
    ).toBeUndefined()
    expect(Outputs.CommonLambdaLayerS3ObjectVersion.Value).toBe(
      'S3ObjectVersion',
    )
  })

  it('throws when a REFERENCE resource has no VersionId (unversioned bucket)', () => {
    expect(() =>
      ctx.patchReferenceObjectVersions({ 'common.zip': 'layerVersion1' }),
    ).toThrow(/S3 object version/)
  })
})
