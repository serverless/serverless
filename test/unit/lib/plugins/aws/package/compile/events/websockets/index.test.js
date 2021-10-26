'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../../../../../../../../lib/plugins/aws/provider');
const AwsCompileWebsocketsEvents = require('../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index');
const Serverless = require('../../../../../../../../../lib/Serverless');
const runServerless = require('../../../../../../../../utils/run-serverless');

describe('AwsCompileWebsocketsEvents', () => {
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const serverless = new Serverless({ commands: [], options: {} });
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
          expect(compileStageStub.calledAfter(compileRoutesStub)).to.be.equal(true);
          expect(compileDeploymentStub.calledAfter(compileStageStub)).to.be.equal(true);
        });
      });
    });

    it('should resolve if no functions are given', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {};

      return awsCompileWebsocketsEvents.hooks['package:compileEvents']();
    });
  });
});

describe('test/unit/lib/plugins/aws/package/compile/events/websockets/index.test.js', () => {
  describe.skip('TODO: regular configuration', () => {
    before(async () => {
      await runServerless({
        fixture: 'function',
        command: 'package',

        configExt: {
          functions: {
            basic: {
              events: [
                {
                  websocket: '$connect',
                },
              ],
            },
          },
        },
      });
    });

    it('should create a websocket api resource', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/websockets/lib/api.test.js#L37-L52
    });

    it('should configure expected IAM', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/websockets/lib/api.test.js#L66-L91
    });
  });

  describe.skip('TODO: external websocket API', () => {
    before(async () => {
      await runServerless({
        fixture: 'function',
        command: 'package',

        configExt: {
          provider: {
            apiGateway: {
              websocketApiId: '5ezys3sght',
            },
            iam: {
              role: 'arn:aws:iam::123456789012:role/fromProvider',
            },
          },
          functions: {
            basic: {
              events: [
                {
                  websocket: '$connect',
                },
              ],
            },
          },
        },
      });
    });

    it('should not create a websocket api resource', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/websockets/lib/api.test.js#L54-L64
    });

    it('should not configure IAM policies with custom roles', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/websockets/lib/api.test.js#L93-L103
    });
  });
});
