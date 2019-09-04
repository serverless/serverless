'use strict';
const expect = require('chai').expect;
const getS3EndpointForRegion = require('./getS3EndpointForRegion');

describe('getS3EndpointForRegion', () => {
  it('should return useast endpoint for us-east-1', () => {
    const expected = 's3.us-east-1.amazonaws.com';
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
  it('should return southeast endpoint for ap-southeast-1', () => {
    const expected = 's3.ap-southeast-1.amazonaws.com';
    const actual = getS3EndpointForRegion('ap-southeast-1');
    expect(actual).to.equal(expected);
  });
  it('should return standard endpoint for empty region', () => {
    const expected = 's3.amazonaws.com';
    const actual = getS3EndpointForRegion('');
    expect(actual).to.equal(expected);
  });
});
