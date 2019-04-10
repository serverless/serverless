'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileStage()', () => {
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

    awsCompileWebsocketsEvents.websocketsApiLogicalId
      = awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();
    awsCompileWebsocketsEvents.websocketsDeploymentLogicalId
      = awsCompileWebsocketsEvents.provider.naming.getWebsocketsDeploymentLogicalId(1234);
  });

  it('should create a stage resource', () => awsCompileWebsocketsEvents.compileStage().then(() => {
    const resources = awsCompileWebsocketsEvents.serverless.service.provider
      .compiledCloudFormationTemplate.Resources;
    const resourceKeys = Object.keys(resources);

    expect(resourceKeys[0]).to.equal('WebsocketsDeploymentStage');
    expect(resources.WebsocketsDeploymentStage.Type).to.equal('AWS::ApiGatewayV2::Stage');
    expect(resources.WebsocketsDeploymentStage.Properties.ApiId).to.deep.equal({
      Ref: 'WebsocketsApi',
    });
    expect(resources.WebsocketsDeploymentStage.Properties.StageName).to.equal('dev');
    expect(resources.WebsocketsDeploymentStage.Properties.Description)
      .to.equal('Serverless Websockets');
  }));
});
