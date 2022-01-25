'use strict';
const expect = require('chai').expect;
const getS3EndpointForRegion = require('../../../../../../lib/plugins/aws/utils/get-s3-endpoint-for-region');

describe('getS3EndpointForRegion', () => {
  it('should return standard endpoint for us-east-1', () => {
    const expected = 's3.amazonaws.com';
    const actual = getS3EndpointForRegion('us-east-1');
    expect(actual).to.equal(expected);
  });
  it('should return govcloud endpoint for us-gov-west-1', () => {
    const expected = 's3-us-gov-west-1.amazonaws.com';
    const actual = getS3EndpointForRegion('us-gov-west-1');
    expect(actual).to.equal(expected);
  });
  it('should return china endpoint for cn-north-1', () => {
    const expected = 's3.cn-north-1.amazonaws.com.cn';
    const actual = getS3EndpointForRegion('cn-north-1');
    expect(actual).to.equal(expected);
  });
  it('should return US isolated region', () => {
    const expected = 's3.us-iso-east-1.c2s.ic.gov';
    const actual = getS3EndpointForRegion('us-iso-east-1');
    expect(actual).to.equal(expected);
  });
  it('should return US isolated B region', () => {
    const expected = 's3.us-isob-east-1.sc2s.sgov.gov';
    const actual = getS3EndpointForRegion('us-isob-east-1');
    expect(actual).to.equal(expected);
  });
});
