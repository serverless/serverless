'use strict';

const expect = require('chai').expect;
const resolveCfImportValue = require('../../../../../../lib/plugins/aws/utils/resolveCfImportValue');

describe('#resolveCfImportValue', () => {
  it('should return matching exported value if found', () => {
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
    return resolveCfImportValue(provider, 'exportName').then((result) => {
      expect(result).to.equal('exportValue');
    });
  });
});
