'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileRestApi()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.serverless.service.service = 'new-service';
  });

  it('should set the restApiLogicalId', () =>
    awsCompileApigEvents.compileRestApi().then(() => {
      expect(awsCompileApigEvents).to.have.property('restApiLogicalId');
    })
  );

  it('should create a REST API resource', () =>
    awsCompileApigEvents.compileRestApi().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({
        ApiGatewayRestApi: {
          Type: 'AWS::ApiGateway::RestApi',
          Properties: {
            Name: 'dev-new-service',
          },
        },
      });
    })
  );
});
