'use strict';

const chai = require('chai');
const resolveCfImportValue = require('../../../../../../lib/plugins/aws/utils/resolve-cf-import-value');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('#resolveCfImportValue', () => {
  it('should return matching exported value if found', async () => {
    const provider = {
      request: async () => ({
        Exports: [
          {
            Name: 'anotherName',
            Value: 'anotherValue',
          },
          {
            Name: 'exportName',
            Value: 'exportValue',
          },
        ],
      }),
    };
    const result = await expect(resolveCfImportValue(provider, 'exportName')).to.be.fulfilled;
    expect(result).to.equal('exportValue');
  });
});
