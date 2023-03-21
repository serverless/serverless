'use strict';

const chai = require('chai');
const resolveCfRefValue = require('../../../../../../lib/plugins/aws/utils/resolve-cf-ref-value');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('#resolveCfRefValue', () => {
  it('should return matching exported value if found', async () => {
    const provider = {
      naming: {
        getStackName: () => 'stack-name',
      },
      request: async () => ({
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
    const result = await expect(resolveCfRefValue(provider, 'myDB')).to.be.fulfilled;
    expect(result).to.equal('stack-name-db-id');
  });
});
