'use strict';
const expect = require('chai').expect;
const parseS3URI = require('../../../../../../lib/plugins/aws/utils/parse-s3-uri');

describe('test/unit/lib/plugins/aws/utils/parse-s3-uri.test.js', () => {
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
  it('should parse an old style S3 URL with region', () => {
    const expected = {
      Bucket: 'test-bucket',
      Key: 'path/to/artifact.zip',
    };
    const actual = parseS3URI(
      'https://s3.us-west-1.amazonaws.com/test-bucket/path/to/artifact.zip'
    );
    expect(actual).to.deep.equal(expected);
  });
  it('should parse another old style S3 URL with region', () => {
    const expected = {
      Bucket: 'test-bucket',
      Key: 'path/to/artifact.zip',
    };
    const actual = parseS3URI(
      'https://s3-us-west-1.amazonaws.com/test-bucket/path/to/artifact.zip'
    );
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
  it('should parse a new style S3 URL with region', () => {
    const expected = {
      Bucket: 'test-bucket',
      Key: 'path/to/artifact.zip',
    };
    const actual = parseS3URI(
      'https://test-bucket.s3.eu-west-1.amazonaws.com/path/to/artifact.zip'
    );
    expect(actual).to.deep.equal(expected);
  });
  it('should parse another new style S3 URL with region', () => {
    const expected = {
      Bucket: 'test-bucket',
      Key: 'path/to/artifact.zip',
    };
    const actual = parseS3URI(
      'https://test-bucket.s3-eu-west-1.amazonaws.com/path/to/artifact.zip'
    );
    expect(actual).to.deep.equal(expected);
  });
  it('should reject non S3 URLs', () => {
    const actual = parseS3URI('https://example.com/path/to/artifact.zip');
    expect(actual).to.be.null;
  });
});
