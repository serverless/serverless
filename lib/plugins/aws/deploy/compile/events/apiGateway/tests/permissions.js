'use strict';

const expect = require('chai').expect;

const AwsCompileApigEvents = require('../index');
const naming = require('../../../../../lib/naming');
const Serverless = require('../../../../../../../Serverless');

describe('#awsCompilePermissions()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    naming.configure(serverless);
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'POST',
            },
          },
          {
            http: 'GET bar/foo',
          },
        ],
      },
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.resourcePaths = ['foo/bar', 'bar/foo'];
  });

  it('should create permission resource when http events are given', () => awsCompileApigEvents
    .compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[naming.getLambdaApiGatewayPermissionName('first')]
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal(
          naming.getLogicalLambdaName('first')
      );
    })
  );

  it('should create permission resources for authorizers when provided as string', () => {
    const authorizerName = 'authorizer';
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = authorizerName;

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[naming.getLambdaApiGatewayPermissionName(authorizerName)]
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal(
          naming.getLogicalLambdaName(authorizerName)
      );
    });
  });

  it('should create permission resources for authorizers when provided as ARN string', () => {
    const authorizerName = 'xxx:dev-authorizer';
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = authorizerName;

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[naming.getLambdaApiGatewayPermissionName('authorizer')]
        .Properties.FunctionName).to.equal(authorizerName);
    });
  });

  it('should create permission resources for authorizers when provided as object', () => {
    const authorizerName = 'authorizer';
    awsCompileApigEvents.serverless.service
      .functions.first.events[0].http.authorizer = {
        name: authorizerName,
      };

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[naming.getLambdaApiGatewayPermissionName(authorizerName)]
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal(
          naming.getLogicalLambdaName(authorizerName)
      );
    });
  });

  it('should create permission resources for authorizers when provided as ARN object', () => {
    const authorizerName = 'xxx:dev-authorizer';
    awsCompileApigEvents.serverless.service
      .functions.first.events[0].http.authorizer = {
        arn: authorizerName,
      };

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[naming.getLambdaApiGatewayPermissionName('authorizer')]
        .Properties.FunctionName).to.equal(authorizerName);
    });
  });

  it('should not create permission resources when http events are not given', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [],
      },
    };

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });
  });
});
