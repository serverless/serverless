'use strict';

const expect = require('chai').expect;
const BbPromise = require('bluebird');
const resolveCfImportValue = require('./resolveCfImportValue');

describe('#resolveCfImportValue', () => {
  it('should return matching exported value if found', () => {
    const provider = {
      request: () =>
        BbPromise.resolve({
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
    return resolveCfImportValue(provider, 'exportName').then(result => {
      expect(result).to.equal('exportValue');
    });
  });
});
