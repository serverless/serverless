'use strict';
const expect = require('chai').expect;
const parseS3URI = require('../../../../../../lib/plugins/aws/utils/parseS3URI');

describe('parseS3URI', () => {
  it('should parse an S3 URI', () => {
    const expected = {
      Bucket: 'test-bucket',
      Key: 'path/to/artifact.zip',
    };
    const actual = parseS3URI('s3://test-bucket/path/to/artifact.zip');
    expect(actual).to.deep.equal(expected);
  });
  it('should parse an old style S3 URL', () => {
    const expected = {
      Bucket: 'test-bucket',
      Key: 'path/to/artifact.zip',
    };
    const actual = parseS3URI('https://s3.amazonaws.com/test-bucket/path/to/artifact.zip');
    expect(actual).to.deep.equal(expected);
  });
  it('should parse a new style S3 URL', () => {
    const expected = {
      Bucket: 'test-bucket',
      Key: 'path/to/artifact.zip',
    };
    const actual = parseS3URI('https://test-bucket.s3.amazonaws.com/path/to/artifact.zip');
    expect(actual).to.deep.equal(expected);
  });
  it('should parse a S3 ARN', () => {
    const expected = {
      Bucket: 'test-bucket',
      Key: 'path/to/artifact.zip',
    };
    const actual = parseS3URI('arn:aws:s3:::test-bucket/path/to/artifact.zip');
    expect(actual).to.deep.equal(expected);
  });
  it('should reject non S3 URLs', () => {
    const actual = parseS3URI('https://example.com/path/to/artifact.zip');
    expect(actual).to.be.null;
  });
});
