'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');

describe('AwsInfo', () => {
  let serverless;
  let awsInfo;
  let validateStub;
  let getStackInfoStub;
  let getApiKeyValuesStub;
  let displayServiceInfoStub;
  let displayApiKeysStub;
  let displayEndpointsStub;
  let displayFunctionsStub;
  let displayStackOutputsStub;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.cli = {
      log: sinon.stub().returns(),
    };
    awsInfo = new AwsInfo(serverless, options);
    // Load commands and hooks into pluginManager
    serverless.pluginManager.loadCommands(awsInfo);
    serverless.pluginManager.loadHooks(awsInfo);
    validateStub = sinon
      .stub(awsInfo, 'validate').resolves();
    getStackInfoStub = sinon
      .stub(awsInfo, 'getStackInfo').resolves();
    getApiKeyValuesStub = sinon
      .stub(awsInfo, 'getApiKeyValues').resolves();
    displayServiceInfoStub = sinon
      .stub(awsInfo, 'displayServiceInfo').resolves();
    displayApiKeysStub = sinon
      .stub(awsInfo, 'displayApiKeys').resolves();
    displayEndpointsStub = sinon
      .stub(awsInfo, 'displayEndpoints').resolves();
    displayFunctionsStub = sinon
      .stub(awsInfo, 'displayFunctions').resolves();
    displayStackOutputsStub = sinon
      .stub(awsInfo, 'displayStackOutputs').resolves();
  });

  afterEach(() => {
    awsInfo.validate.restore();
    awsInfo.getStackInfo.restore();
    awsInfo.getApiKeyValues.restore();
    awsInfo.displayServiceInfo.restore();
    awsInfo.displayApiKeys.restore();
    awsInfo.displayEndpoints.restore();
    awsInfo.displayFunctions.restore();
    awsInfo.displayStackOutputs.restore();
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsInfo.hooks).to.be.not.empty);

    it('should set the provider variable to the AwsProvider instance', () =>
      expect(awsInfo.provider).to.be.instanceof(AwsProvider));

    it('should set an empty options object if no options are given', () => {
      const awsInfoWithEmptyOptions = new AwsInfo(serverless);

      expect(awsInfoWithEmptyOptions.options).to.deep.equal({});
    });

    it('should run promise chain in order for "info:info" hook', () =>
      awsInfo.hooks['info:info']().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getStackInfoStub.calledAfter(validateStub)).to.equal(true);
        expect(displayServiceInfoStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
        expect(displayApiKeysStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
        expect(displayEndpointsStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
        expect(displayFunctionsStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
        expect(displayStackOutputsStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
      })
    );

    describe('when running "deploy:deploy" hook', () => {
      it('should run promise chain in order if no deploy is not set', () =>
        awsInfo.hooks['deploy:deploy']().then(() => {
          expect(validateStub.calledOnce).to.equal(true);
          expect(getStackInfoStub.calledAfter(validateStub)).to.equal(true);
          expect(displayServiceInfoStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
          expect(displayApiKeysStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
          expect(displayEndpointsStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
          expect(displayFunctionsStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
          expect(displayStackOutputsStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
        })
      );
    });
  });
});
