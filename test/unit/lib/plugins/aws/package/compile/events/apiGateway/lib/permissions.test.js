'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/apiGateway/index');
const Serverless = require('../../../../../../../../../../lib/Serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');

describe('#awsCompilePermissions()', () => {
  let awsCompileApigEvents;

  beforeEach(() => {
    const serverless = new Serverless({ commands: [], options: {} });
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

    awsCompileApigEvents.compilePermissions();
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionApiGateway.Properties.FunctionName['Fn::GetAtt'][0]
    ).to.equal('FirstLambdaFunction');

    const deepObj = {
      'Fn::Join': [
        '',
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

    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionApiGateway.Properties.SourceArn
    ).to.deep.equal(deepObj);
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

    awsCompileApigEvents.compilePermissions();
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionApiGateway.Properties.FunctionName['Fn::GetAtt'][0]
    ).to.equal('FirstLambdaFunction');

    const deepObj = {
      'Fn::Join': [
        '',
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

    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionApiGateway.Properties.SourceArn
    ).to.deep.equal(deepObj);
  });

  it('should setup permissions for an alias in case of provisioned function', () => {
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
        lambdaAliasName: 'provisioned',
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

    awsCompileApigEvents.compilePermissions();
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionApiGateway.Properties.FunctionName['Fn::Join'][1][1]
    ).to.equal('provisioned');
  });

  it('should create limited permission resources for authorizers', () => {
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
        lambdaLogicalId: 'AuthorizerLambdaFunction',
        event: {
          http: {
            path: 'foo/bar',
            method: 'post',
          },
          functionName: 'authorizer',
        },
      },
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

    const deepObj = {
      'Fn::Join': [
        '',
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

    awsCompileApigEvents.compilePermissions();
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .AuthorizerLambdaPermissionApiGateway.Properties.FunctionName
    ).to.deep.equal({ 'Fn::GetAtt': ['AuthorizerLambdaFunction', 'Arn'] });
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .AuthorizerLambdaPermissionApiGateway.Properties.SourceArn
    ).to.deep.equal(deepObj);
  });

  it('should create limited permission resources for aliased authorizers', () => {
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
        lambdaLogicalId: 'AuthorizerLambdaFunction',
        lambdaAliasName: 'provisioned',
        event: {
          http: {
            path: 'foo/bar',
            method: 'post',
          },
          functionName: 'authorizer',
        },
      },
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

    const deepObj = {
      'Fn::Join': [
        '',
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

    awsCompileApigEvents.compilePermissions();
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .AuthorizerLambdaPermissionApiGateway.Properties.FunctionName
    ).to.deep.equal({
      'Fn::Join': [':', [{ 'Fn::GetAtt': ['AuthorizerLambdaFunction', 'Arn'] }, 'provisioned']],
    });
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .AuthorizerLambdaPermissionApiGateway.Properties.SourceArn
    ).to.deep.equal(deepObj);
  });

  it('should not create permission resources when http events are not given', () => {
    awsCompileApigEvents.validated.events = [];
    awsCompileApigEvents.permissionMapping = [];
    awsCompileApigEvents.compilePermissions();
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
    ).to.deep.equal({});
  });

  it('should not create permission resources when the authorizer is managed externally', () => {
    const event = {
      functionName: 'First',
      http: {
        authorizer: {
          name: 'authorizer',
          arn: { 'Fn::GetAtt': ['AuthorizerLambdaFunction', 'Arn'] },
          managedExternally: true,
        },
        path: 'foo/bar',
        method: 'post',
      },
    };

    awsCompileApigEvents.validated.events = [event];
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.permissionMapping = [
      {
        lambdaLogicalId: 'FirstLambdaFunction',
        resourceName: 'FooBar',
        event,
      },
    ];

    // the important thing in this object is that it does *not* contain
    // a permission allowing API Gateway to call the authorizer. If
    // managedExternally was false (as it is in other tests), then the
    // permission would be created.
    const deepObj = {
      FirstLambdaPermissionApiGateway: {
        DependsOn: undefined,
        Properties: {
          Action: 'lambda:InvokeFunction',
          FunctionName: {
            'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
          },
          Principal: 'apigateway.amazonaws.com',
          SourceArn: {
            'Fn::Join': [
              '',
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
          },
        },
        Type: 'AWS::Lambda::Permission',
      },
    };

    awsCompileApigEvents.compilePermissions();
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
    ).to.deep.equal(deepObj);
  });
});
