import { liftS3Bucket } from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/lifters/s3.js'

const identity = { resolveIntrinsics: (v) => v }

describe('liftS3Bucket', () => {
  it('uses a literal BucketName, synthesizes the ARN, and retains properties', () => {
    const record = liftS3Bucket(
      'UploadsBucket',
      {
        Type: 'AWS::S3::Bucket',
        Properties: { BucketName: 'uploads', AccessControl: 'Private' },
      },
      identity,
    )
    expect(record).toEqual({
      logicalId: 'UploadsBucket',
      name: 'uploads',
      arn: 'arn:aws:s3:::uploads',
      properties: { BucketName: 'uploads', AccessControl: 'Private' },
    })
  })

  it('falls back to the logical ID when BucketName is absent', () => {
    const record = liftS3Bucket(
      'UploadsBucket',
      { Type: 'AWS::S3::Bucket' },
      identity,
    )
    expect(record.name).toBe('UploadsBucket')
    expect(record.arn).toBe('arn:aws:s3:::UploadsBucket')
  })

  it('throws OFFLINE_LIFTER_WRONG_TYPE for a non-bucket resource', () => {
    expect(() =>
      liftS3Bucket('T', { Type: 'AWS::SNS::Topic' }, identity),
    ).toThrow(expect.objectContaining({ code: 'OFFLINE_LIFTER_WRONG_TYPE' }))
  })
})
