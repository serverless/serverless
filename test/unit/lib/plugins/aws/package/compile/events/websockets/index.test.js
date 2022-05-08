'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../../../../../../../../lib/plugins/aws/provider');
const AwsCompileWebsocketsEvents = require('../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index');
const Serverless = require('../../../../../../../../../lib/serverless');
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
  describe('regular configuration', () => {
    let cfTemplate;
    let awsNaming;
    before(async () => {
      ({ cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        command: 'package',

        configExt: {
          provider: {
            websocket: {
              useProviderTags: true,
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
      }));
    });

    it('should create a websocket api resource', () => {
      const websocketsApiName = awsNaming.getWebsocketsApiName();
      expect(cfTemplate.Resources.WebsocketsApi).to.deep.equal({
        Type: 'AWS::ApiGatewayV2::Api',
        Properties: {
          Name: websocketsApiName,
          RouteSelectionExpression: '$request.body.action',
          Description: 'Serverless Websockets',
          ProtocolType: 'WEBSOCKET',
        },
      });
    });

    it('should configure expected IAM', () => {
      const id = awsNaming.getRoleLogicalId();
      expect(
        cfTemplate.Resources[id].Properties.Policies[0].PolicyDocument.Statement
      ).to.deep.include({
        Effect: 'Allow',
        Action: ['execute-api:ManageConnections'],
        Resource: [{ 'Fn::Sub': 'arn:${AWS::Partition}:execute-api:*:*:*/@connections/*' }],
      });
    });
  });

  describe('regular configuration with tags', () => {
    let cfTemplate;
    let awsNaming;
    before(async () => {
      ({ cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        command: 'package',

        configExt: {
          provider: {
            stackTags: {
              stack_tag: 'foo',
            },
            tags: {
              tag: 'bar',
            },
            websocket: {
              useProviderTags: true,
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
      }));
    });

    it('should create a websocket api resource with tags', () => {
      const websocketsApiName = awsNaming.getWebsocketsApiName();
      expect(cfTemplate.Resources.WebsocketsApi).to.deep.equal({
        Type: 'AWS::ApiGatewayV2::Api',
        Properties: {
          Name: websocketsApiName,
          RouteSelectionExpression: '$request.body.action',
          Description: 'Serverless Websockets',
          ProtocolType: 'WEBSOCKET',
          Tags: {
            tag: 'bar',
          },
        },
      });
    });
  });

  describe('external websocket API', () => {
    let cfTemplate;
    let awsNaming;
    before(async () => {
      ({ cfTemplate, awsNaming } = await runServerless({
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
      }));
    });

    it('should not create a websocket api resource', () => {
      expect(cfTemplate.Resources.WebsocketsApi).to.equal(undefined);
    });

    it('should not configure IAM policies with custom roles', () => {
      const id = awsNaming.getRoleLogicalId();
      expect(cfTemplate.Resources[id]).to.equal(undefined);
    });
  });
});
