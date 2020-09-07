'use strict';

const expect = require('chai').expect;
const BbPromise = require('bluebird');
const resolveCfRefValue = require('./resolveCfRefValue');

describe('#resolveCfRefValue', () => {
  it('should return matching exported value if found', () => {
    const provider = {
      naming: {
        getStackName: () => 'stack-name',
      },
      request: () =>
        BbPromise.resolve({
          StackResourceSummaries: [
            {
              LogicalResourceId: 'myS3',
              PhysicalResourceId: 'stack-name-s3-id',
            },
            {
              LogicalResourceId: 'myDB',
              PhysicalResourceId: 'stack-name-db-id',
            },
          ],
        }),
    };
    return resolveCfRefValue(provider, 'myDB').then(result => {
      expect(result).to.equal('stack-name-db-id');
    });
  });
});
