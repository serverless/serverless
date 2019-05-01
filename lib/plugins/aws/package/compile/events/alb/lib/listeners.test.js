'use strict';

const expect = require('chai').expect;
const AwsCompileAlbEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileListeners()', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'some-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless);
  });

  it('should create ELB listener resources', () => {
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
          name: 'some-alb-event-2',
        },
      ],
    };

    return awsCompileAlbEvents.compileListeners().then(() => {
      const resources = awsCompileAlbEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources;

      expect(resources.FirstAlbListener0).to.deep.equal({
        Type: 'AWS::ElasticLoadBalancingV2::Listener',
        Properties: {
          Certificates: [
            {
              CertificateArn: 'arn:aws:iam::123456:server-certificate/ProdServerCert',
            },
          ],
          DefaultActions: [
            {
              TargetGroupArn: {
                Ref: 'SomeDashalbDasheventDash1AlbTargetGroup',
              },
              Type: 'forward',
            },
          ],
          LoadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456:loadbalancer/app/my-load-balancer/50dc6c495c0c9188', // eslint-disable-line
          Port: '443',
          Protocol: 'HTTPS',
        },
      });
      expect(resources.SecondAlbListener1).to.deep.equal({
        Type: 'AWS::ElasticLoadBalancingV2::Listener',
        Properties: {
          Certificates: [],
          DefaultActions: [
            {
              TargetGroupArn: {
                Ref: 'SomeDashalbDasheventDash2AlbTargetGroup',
              },
              Type: 'forward',
            },
          ],
          LoadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456:loadbalancer/app/my-load-balancer/50dc6c495c0c9188', // eslint-disable-line
          Port: '80',
          Protocol: 'HTTP',
        },
      });
    });
  });
});
