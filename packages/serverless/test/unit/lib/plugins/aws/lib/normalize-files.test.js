import { describe, it, expect } from '@jest/globals'

const normalizeFiles = (
  await import('../../../../../../lib/plugins/aws/lib/normalize-files.js')
).default

describe('normalizeCloudFormationTemplate', () => {
  it('blanks S3Key and removes S3ObjectVersion on function Code', () => {
    const template = {
      Resources: {
        FooLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Code: {
              S3Bucket: 'bucket',
              S3Key: 'serverless/svc/dev/123/svc.zip',
              S3ObjectVersion: 'abc123',
              S3ObjectStorageMode: 'REFERENCE',
            },
          },
        },
      },
    }
    const result = normalizeFiles.normalizeCloudFormationTemplate(template)
    const code = result.Resources.FooLambdaFunction.Properties.Code
    expect(code.S3Key).toBe('')
    expect('S3ObjectVersion' in code).toBe(false)
    expect(code.S3ObjectStorageMode).toBe('REFERENCE')
  })

  it('removes S3ObjectVersion on layer Content', () => {
    const template = {
      Resources: {
        MyLambdaLayer: {
          Type: 'AWS::Lambda::LayerVersion',
          Properties: {
            Content: {
              S3Bucket: 'bucket',
              S3Key: 'serverless/svc/dev/123/layer.zip',
              S3ObjectVersion: 'def456',
            },
          },
        },
      },
    }
    const result = normalizeFiles.normalizeCloudFormationTemplate(template)
    const content = result.Resources.MyLambdaLayer.Properties.Content
    expect(content.S3Key).toBe('')
    expect('S3ObjectVersion' in content).toBe(false)
  })

  it('produces identical output for templates without S3ObjectVersion (hash stability)', () => {
    const template = {
      Resources: {
        FooLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: { Code: { S3Bucket: 'b', S3Key: 'k' } },
        },
      },
    }
    const a = JSON.stringify(
      normalizeFiles.normalizeCloudFormationTemplate(template),
    )
    const b = JSON.stringify(
      normalizeFiles.normalizeCloudFormationTemplate(template),
    )
    expect(a).toBe(b)
    expect(a).not.toContain('S3ObjectVersion')
  })

  it('normalizes a template that HAS Code/Content.S3ObjectVersion to the exact same JSON as a template that never had those fields (no-op-deploy-detection guarantee)', () => {
    // This is the guarantee the whole reference-code-storage no-op-deploy
    // detection depends on: the local pre-patch template (built before any
    // S3ObjectVersion is known) and the remote post-patch template (which
    // patch-reference-object-versions.js has stamped with the real
    // S3ObjectVersion values) must normalize identically, or every deploy
    // would be seen as a diff even when nothing changed.
    const withVersions = {
      Resources: {
        FooLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Code: {
              S3Bucket: 'bucket',
              S3Key: 'serverless/svc/dev/123/svc.zip',
              S3ObjectVersion: 'abc123',
              S3ObjectStorageMode: 'REFERENCE',
            },
          },
        },
        MyLambdaLayer: {
          Type: 'AWS::Lambda::LayerVersion',
          Properties: {
            Content: {
              S3Bucket: 'bucket',
              S3Key: 'serverless/svc/dev/123/layer.zip',
              S3ObjectVersion: 'def456',
              S3ObjectStorageMode: 'REFERENCE',
            },
          },
        },
      },
    }
    // Same template, but as if it never went through patch-reference-object-versions.js:
    // no S3ObjectVersion field at all, and a different (pre-patch) S3Key —
    // S3Key gets blanked either way, so it must not affect the comparison.
    const withoutVersions = {
      Resources: {
        FooLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Code: {
              S3Bucket: 'bucket',
              S3Key: 'serverless/svc/dev/456/svc.zip',
              S3ObjectStorageMode: 'REFERENCE',
            },
          },
        },
        MyLambdaLayer: {
          Type: 'AWS::Lambda::LayerVersion',
          Properties: {
            Content: {
              S3Bucket: 'bucket',
              S3Key: 'serverless/svc/dev/456/layer.zip',
              S3ObjectStorageMode: 'REFERENCE',
            },
          },
        },
      },
    }

    const normalizedWithVersions = JSON.stringify(
      normalizeFiles.normalizeCloudFormationTemplate(withVersions),
    )
    const normalizedWithoutVersions = JSON.stringify(
      normalizeFiles.normalizeCloudFormationTemplate(withoutVersions),
    )

    expect(normalizedWithVersions).toBe(normalizedWithoutVersions)
    expect(normalizedWithVersions).not.toContain('S3ObjectVersion')
  })
})
