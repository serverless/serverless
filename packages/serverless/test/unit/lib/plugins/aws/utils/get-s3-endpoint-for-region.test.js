import getS3EndpointForRegion from '../../../../../../lib/plugins/aws/utils/get-s3-endpoint-for-region.js'

describe('getS3EndpointForRegion', () => {
  it('should return the regional endpoint for us-east-1', () => {
    expect(getS3EndpointForRegion('us-east-1')).toBe(
      's3.us-east-1.amazonaws.com',
    )
  })

  it('should return the regional endpoint for standard regions', () => {
    expect(getS3EndpointForRegion('us-west-2')).toBe(
      's3.us-west-2.amazonaws.com',
    )
    expect(getS3EndpointForRegion('eu-central-1')).toBe(
      's3.eu-central-1.amazonaws.com',
    )
    expect(getS3EndpointForRegion('ap-southeast-1')).toBe(
      's3.ap-southeast-1.amazonaws.com',
    )
  })

  it('should return the regional endpoint for opt-in regions', () => {
    expect(getS3EndpointForRegion('af-south-1')).toBe(
      's3.af-south-1.amazonaws.com',
    )
    expect(getS3EndpointForRegion('il-central-1')).toBe(
      's3.il-central-1.amazonaws.com',
    )
  })

  it('should lowercase the region', () => {
    expect(getS3EndpointForRegion('US-WEST-2')).toBe(
      's3.us-west-2.amazonaws.com',
    )
  })

  it('should return the GovCloud endpoint for us-gov regions', () => {
    expect(getS3EndpointForRegion('us-gov-west-1')).toBe(
      's3-us-gov-west-1.amazonaws.com',
    )
    expect(getS3EndpointForRegion('us-gov-east-1')).toBe(
      's3-us-gov-east-1.amazonaws.com',
    )
  })

  it('should return the China endpoint for cn regions', () => {
    expect(getS3EndpointForRegion('cn-north-1')).toBe(
      's3.cn-north-1.amazonaws.com.cn',
    )
    expect(getS3EndpointForRegion('cn-northwest-1')).toBe(
      's3.cn-northwest-1.amazonaws.com.cn',
    )
  })

  it('should return the ISO endpoint for iso regions', () => {
    expect(getS3EndpointForRegion('us-iso-east-1')).toBe(
      's3.us-iso-east-1.c2s.ic.gov',
    )
  })

  it('should return the ISOB endpoint for isob regions', () => {
    expect(getS3EndpointForRegion('us-isob-east-1')).toBe(
      's3.us-isob-east-1.sc2s.sgov.gov',
    )
  })
})
