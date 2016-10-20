'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const AwsProvider = require('../../../../../provider/awsProvider');
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileApigEvents', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {
            'us-east-1': {
              vars: {},
            },
          },
        },
      },
    };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsCompileApigEvents.hooks).to.be.not.empty);

    it('should set the provider variable to be an instanceof AwsProvider', () =>
      expect(awsCompileApigEvents.provider).to.be.instanceof(AwsProvider));
  });

  it('should resolve if no functions are given', () => {
    awsCompileApigEvents.serverless.service.functions = {};

    return awsCompileApigEvents.hooks['deploy:compileEvents']();
  });

  it('should run promise chain in order', () => {
    const http = {
      events: [{
        path: 'users',
        method: 'post',
      }],
    };
    const validateStub = sinon
      .stub(awsCompileApigEvents, 'validate', () => http);
    const compileRestApiStub = sinon
      .stub(awsCompileApigEvents, 'compileRestApi').returns(BbPromise.resolve());
    const compileResourcesStub = sinon
      .stub(awsCompileApigEvents, 'compileResources').returns(BbPromise.resolve());
    const compileCors = sinon
      .stub(awsCompileApigEvents, 'compileCors').returns(BbPromise.resolve());
    const compileMethodsStub = sinon
      .stub(awsCompileApigEvents, 'compileMethods').returns(BbPromise.resolve());
    const compileDeploymentStub = sinon
      .stub(awsCompileApigEvents, 'compileDeployment').returns(BbPromise.resolve());
    const compilePermissionsStub = sinon
      .stub(awsCompileApigEvents, 'compilePermissions').returns(BbPromise.resolve());

    return awsCompileApigEvents.hooks['deploy:compileEvents']().then(() => {
      expect(validateStub.calledOnce).to.be.equal(true);
      expect(compileRestApiStub.calledAfter(validateStub)).to.be.equal(true);
      expect(compileResourcesStub.calledAfter(compileRestApiStub)).to.be.equal(true);
      expect(compileCors.calledAfter(compileResourcesStub)).to.be.equal(true);
      expect(compileMethodsStub.calledAfter(compileCors)).to.be.equal(true);
      expect(compileDeploymentStub.calledAfter(compileMethodsStub)).to.be.equal(true);
      expect(compilePermissionsStub.calledAfter(compileDeploymentStub)).to.be.equal(true);
    });
  });
});
