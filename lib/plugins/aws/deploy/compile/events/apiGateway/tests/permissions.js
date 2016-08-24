'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#awsCompilePermissions()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
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
        .Resources.FirstLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('FirstLambdaFunction');
    })
  );

  it('should create permission resources for authorizers when provided as string', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = 'authorizer';

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.AuthorizerLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('LambdaFunctionAuthorizer');
    });
  });

  it('should create permission resources for authorizers when provided as ARN string', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = 'xxx:dev-authorizer';

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.AuthorizerLambdaPermissionApiGateway
        .Properties.FunctionName).to.equal('xxx:dev-authorizer');
    });
  });

  it('should create permission resources for authorizers when provided as object', () => {
    awsCompileApigEvents.serverless.service
      .functions.first.events[0].http.authorizer = {
        name: 'authorizer',
      };

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.AuthorizerLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('AuthorizerLambdaFunction');
    });
  });

  it('should create permission resources for authorizers when provided as ARN object', () => {
    awsCompileApigEvents.serverless.service
      .functions.first.events[0].http.authorizer = {
        arn: 'xxx:dev-authorizer',
      };

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.AuthorizerLambdaPermissionApiGateway
        .Properties.FunctionName).to.equal('xxx:dev-authorizer');
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
