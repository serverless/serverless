'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#awsCompilePermissions()', () => {
  let awsCompileApigEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.validated = {};
  });

  it('should create permission resource when http events are given', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'foo/bar',
          method: 'post',
        },
      }, {
        functionName: 'First',
        http: {
          path: 'foo/bar',
          method: 'get',
        },
      }, {
        functionName: 'Second',
        http: {
          path: 'bar/foo',
          method: 'get',
        },
      },
    ];

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('FirstLambdaFunction');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.SecondLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('SecondLambdaFunction');
    });
  });

  it('should create permission resources for authorizers', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          authorizer: {
            name: 'authorizer',
            arn: { 'Fn::GetAtt': ['AuthorizerLambdaFunction', 'Arn'] },
          },
          path: 'foo/bar',
          method: 'post',
        },
      },
    ];
    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.AuthorizerLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('AuthorizerLambdaFunction');
    });
  });

  it('should not create permission resources when http events are not given', () => {
    awsCompileApigEvents.validated.events = [];
    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });
});
