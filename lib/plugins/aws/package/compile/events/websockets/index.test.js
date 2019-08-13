'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileWebsocketsEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileWebsocketsEvents', () => {
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const serverless = new Serverless();
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
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless, options);
  });

  describe('#constructor()', () => {
    let compileApiStub;
    let compileIntegrationsStub;
    let compileAuthorizersStub;
    let compilePermissionsStub;
    let compileRoutesStub;
    let compileDeploymentStub;
    let compileStageStub;

    beforeEach(() => {
      compileApiStub = sinon.stub(awsCompileWebsocketsEvents, 'compileApi').resolves();
      compileIntegrationsStub = sinon
        .stub(awsCompileWebsocketsEvents, 'compileIntegrations')
        .resolves();
      compileAuthorizersStub = sinon
        .stub(awsCompileWebsocketsEvents, 'compileAuthorizers')
        .resolves();
      compilePermissionsStub = sinon
        .stub(awsCompileWebsocketsEvents, 'compilePermissions')
        .resolves();
      compileRoutesStub = sinon.stub(awsCompileWebsocketsEvents, 'compileRoutes').resolves();
      compileDeploymentStub = sinon
        .stub(awsCompileWebsocketsEvents, 'compileDeployment')
        .resolves();
      compileStageStub = sinon.stub(awsCompileWebsocketsEvents, 'compileStage').resolves();
    });

    afterEach(() => {
      awsCompileWebsocketsEvents.compileApi.restore();
      awsCompileWebsocketsEvents.compileIntegrations.restore();
      awsCompileWebsocketsEvents.compileAuthorizers.restore();
      awsCompileWebsocketsEvents.compilePermissions.restore();
      awsCompileWebsocketsEvents.compileRoutes.restore();
      awsCompileWebsocketsEvents.compileDeployment.restore();
      awsCompileWebsocketsEvents.compileStage.restore();
    });

    it('should have hooks', () => expect(awsCompileWebsocketsEvents.hooks).to.be.not.empty);

    it('should set the provider variable to be an instanceof AwsProvider', () =>
      expect(awsCompileWebsocketsEvents.provider).to.be.instanceof(AwsProvider));

    describe('"package:compileEvents" promise chain', () => {
      afterEach(() => {
        awsCompileWebsocketsEvents.validate.restore();
      });

      it('should run the promise chain in order', () => {
        const validateStub = sinon.stub(awsCompileWebsocketsEvents, 'validate').returns({
          events: [
            {
              functionName: 'first',
              websocket: {
                route: 'echo',
              },
            },
          ],
        });

        return awsCompileWebsocketsEvents.hooks['package:compileEvents']().then(() => {
          expect(validateStub.calledOnce).to.be.equal(true);
          expect(compileApiStub.calledAfter(validateStub)).to.be.equal(true);
          expect(compileIntegrationsStub.calledAfter(compileApiStub)).to.be.equal(true);
          expect(compileAuthorizersStub.calledAfter(compileIntegrationsStub)).to.be.equal(true);
          expect(compilePermissionsStub.calledAfter(compileAuthorizersStub)).to.be.equal(true);
          expect(compileRoutesStub.calledAfter(compilePermissionsStub)).to.be.equal(true);
          expect(compileDeploymentStub.calledAfter(compileRoutesStub)).to.be.equal(true);
          expect(compileStageStub.calledAfter(compileDeploymentStub)).to.be.equal(true);
        });
      });
    });

    it('should resolve if no functions are given', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {};

      return awsCompileWebsocketsEvents.hooks['package:compileEvents']();
    });
  });
});
