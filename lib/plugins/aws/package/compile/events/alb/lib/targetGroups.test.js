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
          listener: 'HTTPS:443',
          loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456:loadbalancer/app/my-load-balancer/50dc6c495c0c9188', // eslint-disable-line
          certificateArn: 'arn:aws:iam::123456:server-certificate/ProdServerCert',
          name: 'some-alb-event-1',
        },
        {
          functionName: 'second',
          listener: 'HTTP:80',
          loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456:loadbalancer/app/my-load-balancer/50dc6c495c0c9188', // eslint-disable-line
          certificateArn: 'arn:aws:iam::123456:server-certificate/ProdServerCert',
          name: 'some-alb-event-2',
        },
      ],
    };

    return awsCompileAlbEvents.compileTargetGroups().then(() => {
      const resources = awsCompileAlbEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources;

      expect(resources.SomeDashalbDasheventDash1AlbTargetGroup).to.deep.equal({
        Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
        Properties: {
          TargetType: 'lambda',
          Targets: [
            {
              Id: {
                'Fn::GetAtt': [
                  'FirstLambdaFunction',
                  'Arn',
                ],
              },
            },
          ],
        },
        DependsOn: ['FirstLambdaPermissionAlb'],
      });
      expect(resources.SomeDashalbDasheventDash2AlbTargetGroup).to.deep.equal({
        Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
        Properties: {
          TargetType: 'lambda',
          Targets: [
            {
              Id: {
                'Fn::GetAtt': [
                  'SecondLambdaFunction',
                  'Arn',
                ],
              },
            },
          ],
        },
        DependsOn: ['SecondLambdaPermissionAlb'],
      });
    });
  });
});
