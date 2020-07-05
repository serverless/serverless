'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const resolveCfImportValue = require('./resolveCfImportValue');

describe('#resolveCfImportValue', () => {
  let provider;
  let providerStub;

  beforeEach(() => {
    const serverless = new Serverless();
    provider = new AwsProvider(serverless, {});
    providerStub = sinon.stub(provider, 'request');
  });

  it('should return matching exported value if found', () => {
    providerStub.resolves({
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
    });
    return resolveCfImportValue(provider, 'exportName').then(result => {
      expect(result).to.equal('exportValue');
    });
  });
});
