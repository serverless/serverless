'use strict';

const expect = require('chai').expect;
const findAndGroupDeployments = require('./findAndGroupDeployments');

describe('#findAndGroupDeployments()', () => {
  it('should return an empty result in case no S3 objects are provided', () => {
    const s3Response = {
      Contents: [],
    };

    expect(findAndGroupDeployments(s3Response, 'serverless', 'test', 'dev')).to.deep.equal([]);
  });

  it('should group stacks', () => {
    const s3Objects = [
      {
        // eslint-disable-next-line max-len
        Key:
          'serverless/test/dev/1476779096930-2016-10-18T08:24:56.930Z/compiled-cloudformation-template.json',
      },
      {
        Key: 'serverless/test/dev/1476779096930-2016-10-18T08:24:56.930Z/test.zip',
      },
      {
        // eslint-disable-next-line max-len
        Key:
          'serverless/test/dev/1476779278222-2016-10-18T08:27:58.222Z/compiled-cloudformation-template.json',
      },
      {
        Key: 'serverless/test/dev/1476779278222-2016-10-18T08:27:58.222Z/test.zip',
      },
      {
        // eslint-disable-next-line max-len
        Key:
          'serverless/test/dev/1476781042481-2016-10-18T08:57:22.481Z/compiled-cloudformation-template.json',
      },
      {
        Key: 'serverless/test/dev/1476781042481-2016-10-18T08:57:22.481Z/test.zip',
      },
    ];
    const s3Response = {
      Contents: s3Objects,
    };

    const expected = [
      [
        {
          directory: '1476779096930-2016-10-18T08:24:56.930Z',
          file: 'compiled-cloudformation-template.json',
        },
        {
          directory: '1476779096930-2016-10-18T08:24:56.930Z',
          file: 'test.zip',
        },
      ],
      [
        {
          directory: '1476779278222-2016-10-18T08:27:58.222Z',
          file: 'compiled-cloudformation-template.json',
        },
        {
          directory: '1476779278222-2016-10-18T08:27:58.222Z',
          file: 'test.zip',
        },
      ],
      [
        {
          directory: '1476781042481-2016-10-18T08:57:22.481Z',
          file: 'compiled-cloudformation-template.json',
        },
        {
          directory: '1476781042481-2016-10-18T08:57:22.481Z',
          file: 'test.zip',
        },
      ],
    ];

    expect(findAndGroupDeployments(s3Response, 'serverless', 'test', 'dev')).to.deep.equal(
      expected
    );
  });
});
