import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { AwsCloudFrontClient } from '../../src/lib/aws/cloudfront.js'

jest.mock('@aws-sdk/client-cloudfront', () => {
  return {
    CloudFrontClient: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
    CreateDistributionCommand: jest.fn(),
    GetDistributionCommand: jest.fn(),
    GetDistributionConfigCommand: jest.fn(),
    UpdateDistributionCommand: jest.fn(),
    DeleteDistributionCommand: jest.fn(),
    ListDistributionsCommand: jest.fn(),
    ListTagsForResourceCommand: jest.fn(),
    TagResourceCommand: jest.fn(),
  }
})

describe('AwsCloudFrontClient', () => {
  let client

  beforeEach(() => {
    jest.clearAllMocks()
    client = new AwsCloudFrontClient()
    client.client.send = jest.fn()
  })

  test('createDistribution creates a CloudFront distribution with ALB as origin', async () => {
    // Mock the findDistributionByTag call (ListDistributionsCommand)
    client.client.send.mockResolvedValueOnce({
      DistributionList: {
        Items: [],
      },
    })

    // Mock the createDistribution call
    client.client.send.mockResolvedValueOnce({
      Distribution: {
        Id: 'DISTRIBUTION123',
        DomainName: 'abcdef.cloudfront.net',
        ARN: 'arn:aws:cloudfront::123456789012:distribution/DISTRIBUTION123',
      },
    })

    // Mock the TagResourceCommand call
    client.client.send.mockResolvedValueOnce({})

    const result = await client.createDistribution({
      resourceNameBase: 'test-service',
      albDnsName: 'test-alb.amazonaws.com',
    })

    expect(result).toEqual({
      Id: 'DISTRIBUTION123',
      DomainName: 'abcdef.cloudfront.net',
      ARN: 'arn:aws:cloudfront::123456789012:distribution/DISTRIBUTION123',
    })
  })

  test('getDistribution returns distribution information', async () => {
    client.client.send.mockResolvedValueOnce({
      Distribution: {
        Id: 'DISTRIBUTION123',
        DomainName: 'abcdef.cloudfront.net',
      },
    })

    const result = await client.getDistribution('DISTRIBUTION123')

    expect(result).toEqual({
      Id: 'DISTRIBUTION123',
      DomainName: 'abcdef.cloudfront.net',
    })
  })

  test('deleteDistribution disables and deletes a distribution', async () => {
    client.client.send.mockResolvedValueOnce({
      DistributionConfig: {
        Enabled: true,
      },
      ETag: 'ETAG123',
    })

    client.client.send.mockResolvedValueOnce({})

    client.client.send.mockResolvedValueOnce({
      Distribution: {
        Id: 'DISTRIBUTION123',
        Status: 'Deployed',
      },
    })

    client.client.send.mockResolvedValueOnce({
      ETag: 'ETAG456',
    })

    client.client.send.mockResolvedValueOnce({})

    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => cb())

    await client.deleteDistribution('DISTRIBUTION123')

    expect(client.client.send).toHaveBeenCalledTimes(5)
  })

  test('updateOriginIfNeeded updates distribution to use Lambda Function URL', async () => {
    client.client.send
      // First call - GetDistributionConfig
      .mockResolvedValueOnce({
        DistributionConfig: {
          Comment: 'Test Distribution (fargate)',
          Origins: {
            Items: [
              {
                Id: 'test-origin',
                DomainName: 'old-alb.amazonaws.com',
                CustomOriginConfig: {
                  HTTPPort: 80,
                  HTTPSPort: 443,
                  OriginProtocolPolicy: 'http-only',
                  OriginSslProtocols: {
                    Items: ['TLSv1.2'],
                    Quantity: 1,
                  },
                },
              },
            ],
            Quantity: 1,
          },
          DefaultCacheBehavior: {
            TargetOriginId: 'test-origin',
            OriginRequestPolicyId: '216adef6-5c7f-47e4-b989-5492eafa07d3',
          },
          Enabled: true,
        },
        ETag: 'ETAG123',
      })
      // Second call - UpdateDistribution
      .mockResolvedValueOnce({
        Distribution: {
          Id: 'DISTRIBUTION123',
          DomainName: 'abcdef.cloudfront.net',
        },
        ETag: 'ETAG456',
      })

    const result = await client.updateOriginIfNeeded({
      distributionId: 'DISTRIBUTION123',
      resourceNameBase: 'test-service',
      functionUrl: 'https://lambda-url.lambda-url.us-east-1.on.aws/',
    })

    expect(result).toEqual({
      Id: 'DISTRIBUTION123',
      DomainName: 'abcdef.cloudfront.net',
    })

    // Verify the UpdateDistribution command was called with correct parameters
    const updateCall = client.client.send.mock.calls[1][0]
    expect(
      updateCall.input.DistributionConfig.Origins.Items[0].DomainName,
    ).toBe('lambda-url.lambda-url.us-east-1.on.aws')
    expect(
      updateCall.input.DistributionConfig.Origins.Items[0].CustomOriginConfig
        .OriginProtocolPolicy,
    ).toBe('https-only')
  })
})
