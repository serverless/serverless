'use strict';

const chai = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const AwsProvider = require('../provider/awsProvider');
const resolveCfImportValue = require('./resolveCfImportValue');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

chai.should();

describe('#resolveCfImportValue', () => {
  let providerStub;

  beforeEach(() => {
    providerStub = sinon.createStubInstance(AwsProvider);
  });

  it('should return matching exported value if found', () => {
    providerStub.request.callsFake(() =>
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
      })
    );
    resolveCfImportValue(providerStub, 'exportName').should.eventually.eql('exportValue');
  });
});
