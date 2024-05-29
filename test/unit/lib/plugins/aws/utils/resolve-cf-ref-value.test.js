'use strict'

const expect = require('chai').expect
const resolveCfRefValue = require('../../../../../../lib/plugins/aws/utils/resolve-cf-ref-value')

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
    }
    const result = await resolveCfRefValue(provider, 'myDB')
    expect(result).to.equal('stack-name-db-id')
  })
})
