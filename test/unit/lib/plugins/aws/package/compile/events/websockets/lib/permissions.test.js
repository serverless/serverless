'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index');
const Serverless = require('../../../../../../../../../../lib/Serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');

describe('#compilePermissions()', () => {
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const serverless = new Serverless({ commands: [], options: {} });
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

    awsCompileWebsocketsEvents.websocketsApiLogicalId =
      awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();
  });

  it('should create a permission resource for every event', () => {
    awsCompileWebsocketsEvents.validated = {
      events: [
        {
          functionName: 'First',
          route: '$connect',
        },
        {
          functionName: 'Second',
          route: '$disconnect',
        },
      ],
    };

    awsCompileWebsocketsEvents.compilePermissions();
    const resources =
      awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources;

    expect(resources).to.deep.equal({
      FirstLambdaPermissionWebsockets: {
        Type: 'AWS::Lambda::Permission',
        DependsOn: ['WebsocketsApi', 'FirstLambdaFunction'],
        Properties: {
          FunctionName: {
            'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'apigateway.amazonaws.com',
        },
      },
      SecondLambdaPermissionWebsockets: {
        Type: 'AWS::Lambda::Permission',
        DependsOn: ['WebsocketsApi', 'SecondLambdaFunction'],
        Properties: {
          FunctionName: {
            'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'apigateway.amazonaws.com',
        },
      },
    });
  });

  it('should create a permission resource for authorizer function', () => {
    awsCompileWebsocketsEvents.validated = {
      events: [
        {
          functionName: 'First',
          route: '$connect',
          authorizer: {
            name: 'auth',
            permission: 'AuthLambdaPermissionWebsockets',
          },
        },
      ],
    };

    awsCompileWebsocketsEvents.compilePermissions();
    const resources =
      awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources;

    expect(resources).to.deep.equal({
      FirstLambdaPermissionWebsockets: {
        Type: 'AWS::Lambda::Permission',
        DependsOn: ['WebsocketsApi', 'FirstLambdaFunction'],
        Properties: {
          FunctionName: {
            'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'apigateway.amazonaws.com',
        },
      },
      AuthLambdaPermissionWebsockets: {
        Type: 'AWS::Lambda::Permission',
        DependsOn: ['WebsocketsApi', 'AuthLambdaPermissionWebsockets'],
        Properties: {
          FunctionName: {
            'Fn::GetAtt': ['AuthLambdaPermissionWebsockets', 'Arn'],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'apigateway.amazonaws.com',
        },
      },
    });
  });
});
