'use strict';

const expect = require('chai').expect;
const resolveCfImportValue = require('../../../../../../lib/plugins/aws/utils/resolve-cf-import-value');

describe('#resolveCfImportValue', () => {
  it('should return matching exported value if found', async () => {
    const provider = {
      request: () =>
        Promise.resolve({
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
    return resolveCfImportValue(provider, 'exportName').then((result) => {
      expect(result).to.equal('exportValue');
    });
  });
});
