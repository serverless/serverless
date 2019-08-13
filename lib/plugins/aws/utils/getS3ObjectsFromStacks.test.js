'use strict';

const expect = require('chai').expect;
const getS3ObjectsFromStacks = require('./getS3ObjectsFromStacks');

describe('#getS3ObjectsFromStacks()', () => {
  it('should return an empty result in case no stacks are provided', () => {
    expect(getS3ObjectsFromStacks([], 'serverless', 'test', 'dev')).to.deep.equal([]);
  });

  it('should return an empty result in case no stacks are provided', () => {
    const stacks = [
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
    ];

    const expected = [
      // eslint-disable-next-line max-len
      {
        Key:
          'serverless/test/dev/1476779096930-2016-10-18T08:24:56.930Z/compiled-cloudformation-template.json',
      },
      { Key: 'serverless/test/dev/1476779096930-2016-10-18T08:24:56.930Z/test.zip' },
      // eslint-disable-next-line max-len
      {
        Key:
          'serverless/test/dev/1476779278222-2016-10-18T08:27:58.222Z/compiled-cloudformation-template.json',
      },
      { Key: 'serverless/test/dev/1476779278222-2016-10-18T08:27:58.222Z/test.zip' },
    ];

    expect(getS3ObjectsFromStacks(stacks, 'serverless', 'test', 'dev')).to.deep.equal(expected);
  });
});
