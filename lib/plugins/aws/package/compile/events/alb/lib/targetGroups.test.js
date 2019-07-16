'use strict';

const expect = require('chai').expect;
const AwsCompileAlbEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileTargetGroups()', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'some-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless);
  });

  it('should create ELB target group resources', () => {
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
        },
      ],
    };

    awsCompileAlbEvents.compileTargetGroups();

    const resources =
      awsCompileAlbEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    expect(resources.FirstAlbTargetGroup1).to.deep.equal({
      Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
      Properties: {
        Name: 'f84548ee49366c89ada86c9655ea00b5',
        TargetType: 'lambda',
        Targets: [
          {
            Id: {
              'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
            },
          },
        ],
        Tags: [
          {
            Key: 'Name',
            Value: 'some-service-first-1-dev',
          },
        ],
      },
      DependsOn: ['FirstLambdaPermissionAlb'],
    });
    expect(resources.SecondAlbTargetGroup2).to.deep.equal({
      Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
      Properties: {
        Name: '6dd7b94b30032ee093c50743d117b64d',
        TargetType: 'lambda',
        Targets: [
          {
            Id: {
              'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'],
            },
          },
        ],
        Tags: [
          {
            Key: 'Name',
            Value: 'some-service-second-2-dev',
          },
        ],
      },
      DependsOn: ['SecondLambdaPermissionAlb'],
    });
  });
});
