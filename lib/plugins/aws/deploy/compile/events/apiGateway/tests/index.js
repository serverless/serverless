'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileApigEvents', () => {
  const serverless = new Serverless();
  serverless.service.resources = { Resources: {} };
  serverless.service.functions = {
    first: {
      events: [
        {
          http: {
            path: 'users',
            method: 'POST',
          },
        },
      ],
    },
  };
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

  const awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);

  describe('#constructor()', () => {
    // note: order of test is important as we don't reset the instances in a beforeEach function

    it('should have hooks', () => expect(awsCompileApigEvents.hooks).to.be.not.empty);

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(awsCompileApigEvents, 'validate').returns(BbPromise.resolve());
      const compileRestApiStub = sinon
        .stub(awsCompileApigEvents, 'compileRestApi').returns(BbPromise.resolve());
      const compileResourcesStub = sinon
        .stub(awsCompileApigEvents, 'compileResources').returns(BbPromise.resolve());
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
        expect(compileMethodsStub.calledAfter(compileResourcesStub)).to.be.equal(true);
        expect(compileDeploymentStub.calledAfter(compileMethodsStub)).to.be.equal(true);
        expect(compilePermissionsStub.calledAfter(compileDeploymentStub)).to.be.equal(true);

        awsCompileApigEvents.validate.restore();
        awsCompileApigEvents.compileRestApi.restore();
        awsCompileApigEvents.compileResources.restore();
        awsCompileApigEvents.compileMethods.restore();
        awsCompileApigEvents.compileDeployment.restore();
        awsCompileApigEvents.compilePermissions.restore();
      });
    });

    it('should resolve if no functions are given', (done) => {
      awsCompileApigEvents.serverless.service.functions = {};

      return awsCompileApigEvents.hooks['deploy:compileEvents']().then(() => {
        done();
      });
    });
  });
});
