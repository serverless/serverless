'use strict';

const expect = require('chai').expect;
const BbPromise = require('bluebird');
const resolveCfFunctionValue = require('./resolveCfFunctionValue');

describe('#resolveCfFunctionValue', () => {
  it('should return unchanged value if no matching function are found', () => {
    return resolveCfFunctionValue({}, 'stringValue').then(result => {
      expect(result).to.equal('stringValue');
    });
  });

  it('should call resolveCfImportValue if ImportValue function is detected', () => {
    const provider = {
      request: () =>
        BbPromise.resolve({
          Exports: [
            {
              Name: 'exported-key',
              Value: 'exported-value',
            },
          ],
        }),
    };
    return resolveCfFunctionValue(provider, { 'Fn::ImportValue': 'exported-key' }).then(result => {
      expect(result).to.equal('exported-value');
    });
  });
});
