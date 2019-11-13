'use strict';

const expect = require('chai').expect;
const AwsCompileAlbEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compilePermissions()', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'some-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless);
  });

  it('should create Lambda permission resources', () => {
    awsCompileAlbEvents.validated = {
      events: [
        {
          functionName: 'first',
          listenerArn:
            'arn:aws:elasticloadbalancing:' +
            'us-east-1:123456789012:listener/app/my-load-balancer/' +
            '50dc6c495c0c9188/f2f7dc8efc522ab2',
          priority: 1,
          conditions: {
            host: 'example.com',
            path: '/hello',
          },
          albId: '50dc6c495c0c9188',
        },
        {
          functionName: 'second',
          listenerArn:
            'arn:aws:elasticloadbalancing:' +
            'us-east-1:123456789012:listener/app/my-load-balancer/' +
            '50dc6c495c0c9188/f2f7dc8efc522ab2',
          priority: 2,
          conditions: {
            path: '/world',
          },
          albId: '50dc6c495c0c9188',
        },
      ],
    };

    awsCompileAlbEvents.compilePermissions();

    const resources =
      awsCompileAlbEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    expect(resources.FirstLambdaPermissionAlb).to.deep.equal({
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: {
          'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
        },
        Principal: 'elasticloadbalancing.amazonaws.com',
        SourceArn: {
          Ref: 'FirstAlbTargetGroup50dc6c495c0c9188',
        },
      },
    });
    expect(resources.FirstLambdaPermissionRegisterTarget).to.deep.equal({
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: {
          'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
        },
        Principal: 'elasticloadbalancing.amazonaws.com',
      },
    });
    expect(resources.SecondLambdaPermissionAlb).to.deep.equal({
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: {
          'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'],
        },
        Principal: 'elasticloadbalancing.amazonaws.com',
        SourceArn: {
          Ref: 'SecondAlbTargetGroup50dc6c495c0c9188',
        },
      },
    });

    expect(resources.SecondLambdaPermissionRegisterTarget).to.deep.equal({
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: {
          'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'],
        },
        Principal: 'elasticloadbalancing.amazonaws.com',
      },
    });
  });
});
