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
          albId: '50dc6c495c0c9188',
          multiValueHeaders: true,
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
          albId: '50dc6c495c0c9188',
          listenerArn:
            'arn:aws:elasticloadbalancing:' +
            'us-east-1:123456789012:listener/app/my-load-balancer/' +
            '50dc6c495c0c9188/f2f7dc8efc522ab2',
          priority: 2,
          conditions: {
            path: '/world',
          },
        },
        {
          // Same function, same alb, different listener/priority
          functionName: 'second',
          albId: '50dc6c495c0c9188',
          listenerArn:
            'arn:aws:elasticloadbalancing:' +
            'us-east-1:123456789012:listener/app/my-load-balancer/' +
            '50dc6c495c0c9188/4e83ccee674eb02d',
          priority: 3,
          conditions: {
            path: '/world',
          },
        },
      ],
    };

    awsCompileAlbEvents.compileTargetGroups();

    const resources =
      awsCompileAlbEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    expect(resources.FirstAlbMultiValueTargetGroup50dc6c495c0c9188).to.deep.equal({
      Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
      Properties: {
        Name: 'cee340765bf4be569254b8969c1d07a0',
        TargetType: 'lambda',
        Targets: [
          {
            Id: {
              'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
            },
          },
        ],
        TargetGroupAttributes: [
          {
            Key: 'lambda.multi_value_headers.enabled',
            Value: true,
          },
        ],
        Tags: [
          {
            Key: 'Name',
            Value: 'some-service-first-50dc6c495c0c9188-dev',
          },
        ],
      },
      DependsOn: ['FirstLambdaPermissionRegisterTarget'],
    });
    expect(resources.SecondAlbTargetGroup50dc6c495c0c9188).to.deep.equal({
      Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
      Properties: {
        Name: '2107a18b6db85bd904d38cb2bdf5af5c',
        TargetType: 'lambda',
        Targets: [
          {
            Id: {
              'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'],
            },
          },
        ],
        TargetGroupAttributes: [
          {
            Key: 'lambda.multi_value_headers.enabled',
            Value: false,
          },
        ],
        Tags: [
          {
            Key: 'Name',
            Value: 'some-service-second-50dc6c495c0c9188-dev',
          },
        ],
      },
      DependsOn: ['SecondLambdaPermissionRegisterTarget'],
    });
    // Target groups are unique to functions/albs, so there should only be 2 target groups
    expect(Object.keys(resources).length).to.be.equal(2);
  });
});
