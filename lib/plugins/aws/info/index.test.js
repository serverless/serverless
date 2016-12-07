'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');

describe('AwsInfo', () => {
  let serverless;
  let awsInfo;
  let validateStub;
  let getStackInfoStub;
  let getApiKeyValuesStub;
  let displayStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsInfo = new AwsInfo(serverless, options);
    validateStub = sinon
      .stub(awsInfo, 'validate').returns(BbPromise.resolve());
    getStackInfoStub = sinon
      .stub(awsInfo, 'getStackInfo').returns(BbPromise.resolve());
    getApiKeyValuesStub = sinon
      .stub(awsInfo, 'getApiKeyValues').returns(BbPromise.resolve());
    displayStub = sinon
      .stub(awsInfo, 'display').returns(BbPromise.resolve());
  });

  afterEach(() => {
    awsInfo.validate.restore();
    awsInfo.getStackInfo.restore();
    awsInfo.getApiKeyValues.restore();
    awsInfo.display.restore();
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
        expect(displayStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
      })
    );

    describe('when running "deploy:deploy" hook', () => {
      it('should run promise chain in order if no deploy is not set', () =>
        awsInfo.hooks['deploy:deploy']().then(() => {
          expect(validateStub.calledOnce).to.equal(true);
          expect(getStackInfoStub.calledAfter(validateStub)).to.equal(true);
          expect(displayStub.calledAfter(getApiKeyValuesStub)).to.equal(true);
        })
      );

      it('should resolve if no deploy', () => {
        awsInfo.options.noDeploy = true;

        return awsInfo.hooks['deploy:deploy']().then(() => {
          expect(validateStub.calledOnce).to.equal(false);
          expect(getStackInfoStub.calledOnce).to.equal(false);
          expect(getApiKeyValuesStub.calledOnce).to.equal(false);
          expect(displayStub.calledOnce).to.equal(false);
        });
      });
    });
  });
});
