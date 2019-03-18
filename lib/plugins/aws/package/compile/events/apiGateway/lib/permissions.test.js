'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#awsCompilePermissions()', () => {
  let awsCompileApigEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.validated = {};
  });

  it('should create limited permission resource scope to REST API', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'foo/bar',
          method: 'post',
        },
      },
    ];
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.permissionMapping = [
      {
        lambdaLogicalId: 'FirstLambdaFunction',
        resourceName: 'FooBar',
        event: {
          http: {
            path: 'foo/bar',
            method: 'post',
          },
          functionName: 'First',
        },
      },
    ];

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('FirstLambdaFunction');

      const deepObj = {
        'Fn::Join': ['',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            ':execute-api:',
            { Ref: 'AWS::Region' },
            ':',
            { Ref: 'AWS::AccountId' },
            ':',
            { Ref: 'ApiGatewayRestApi' },
            '/*/*',
          ],
        ],
      };

      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionApiGateway
        .Properties.SourceArn).to.deep.equal(deepObj);
    });
  });

  it('should create limited permission resource scope to REST API with restApiId provided', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      restApiId: 'xxxxx',
    };
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'foo/bar',
          method: 'post',
        },
      },
    ];
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.permissionMapping = [
      {
        lambdaLogicalId: 'FirstLambdaFunction',
        resourceName: 'FooBar',
        event: {
          http: {
            path: 'foo/bar',
            method: 'post',
          },
          functionName: 'First',
        },
      },
    ];

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('FirstLambdaFunction');

      const deepObj = {
        'Fn::Join': ['',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            ':execute-api:',
            { Ref: 'AWS::Region' },
            ':',
            { Ref: 'AWS::AccountId' },
            ':',
            'xxxxx',
            '/*/*',
          ],
        ],
      };

      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionApiGateway
        .Properties.SourceArn).to.deep.equal(deepObj);
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
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.permissionMapping = [
      {
        lambdaLogicalId: 'FirstLambdaFunction',
        resourceName: 'FooBar',
        event: {
          http: {
            authorizer: {
              name: 'authorizer',
              arn: { 'Fn::GetAtt': ['AuthorizerLambdaFunction', 'Arn'] },
            },
            path: 'foo/bar',
            method: 'post',
          },
          functionName: 'First',
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
    awsCompileApigEvents.permissionMapping = [];
    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });
});
