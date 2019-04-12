'use strict';

const chai = require('chai');
const sinon = require('sinon');
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('#checkForBreakingChanges()', () => {
  let serverless;
  let options;
  let awsCompileApigEvents;
  let stageLogicalId;
  let deploymentLogicalId;
  let getTemplateStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents.serverless = serverless;
    awsCompileApigEvents.provider = new AwsProvider(serverless, options);
    awsCompileApigEvents.options = options;
    stageLogicalId = awsCompileApigEvents
      .provider.naming.getStageLogicalId();
    deploymentLogicalId = awsCompileApigEvents
      .provider.naming.generateApiGatewayDeploymentLogicalId('');
    getTemplateStub = sinon
      .stub(awsCompileApigEvents.provider, 'request');
  });

  afterEach(() => {
    getTemplateStub.restore();
  });

  it('should resolve when Stage / Deployment resources are used', () => {
    const oldTemplate = JSON.stringify({
      Resources: {},
    });
    getTemplateStub.resolves({
      TemplateBody: oldTemplate,
    });

    return expect(awsCompileApigEvents.checkForBreakingChanges()).to.be.fulfilled;
  });

  describe('when upgrading to use the new, dedicated AWS::ApiGateway::Stage resource', () => {
    it('should throw with a helpul error message', () => {
      // the old state
      const oldTemplate = JSON.stringify({
        Resources: {
          [deploymentLogicalId]: {
            Properties: {
              StageName: 'dev',
            },
          },
        },
      });
      getTemplateStub.resolves({
        TemplateBody: oldTemplate,
      });

      // the new state
      awsCompileApigEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[stageLogicalId] = {};

      return awsCompileApigEvents.checkForBreakingChanges()
        .should.be.rejectedWith(/NOTE: Enabling/);
    });
  });

  describe('when downgrading to use AWS::ApiGateway::Deployment embedded stage', () => {
    beforeEach(() => {
      // the old state
      const oldTemplate = JSON.stringify({
        Resources: {
          [stageLogicalId]: {},
        },
      });
      getTemplateStub.resolves({
        TemplateBody: oldTemplate,
      });

      // the new state
      awsCompileApigEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[deploymentLogicalId] = {
          Properties: {
            StageName: 'dev',
          },
        };
    });

    it('should throw with a helpul error message', () => awsCompileApigEvents
      .checkForBreakingChanges().should.be.rejectedWith(/NOTE: Disabling/)
    );

    it('should resolve if the user uses the --force option', () => {
      options.force = true;

      return expect(awsCompileApigEvents.checkForBreakingChanges()).to.resolve;
    });
  });

  it('should resolve when no stack can be found', () => {
    getTemplateStub.rejects({
      providerError: {
        code: 'ValidationError',
      },
    });
    return expect(awsCompileApigEvents.checkForBreakingChanges()).to.resolve;
  });

  it('should re-throw an error when a stack can be found but something went wrong', () => {
    getTemplateStub.rejects('Whoops... Something went wrong');
    return awsCompileApigEvents.checkForBreakingChanges().should.be.rejectedWith(/Whoops/);
  });
});
