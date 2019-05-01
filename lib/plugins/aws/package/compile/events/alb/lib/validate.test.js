'use strict';

const expect = require('chai').expect;
const AwsCompileAlbEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#validate()', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'some-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless);
  });

  it('should detect alb event definitions', () => {
    awsCompileAlbEvents.serverless.service.functions = {
      first: {
        events: [
          {
            alb: {
              listener: 'HTTPS:443',
              loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456:loadbalancer/app/my-load-balancer/50dc6c495c0c9188', // eslint-disable-line
              certificateArn: 'arn:aws:iam::123456:server-certificate/ProdServerCert',
              name: 'some-alb-event-1',
            },
          },
        ],
      },
      second: {
        events: [
          {
            alb: {
              listener: 'HTTP:80',
              loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456:loadbalancer/app/my-load-balancer/50dc6c495c0c9188', // eslint-disable-line
              certificateArn: 'arn:aws:iam::123456:server-certificate/ProdServerCert',
              name: 'some-alb-event-2',
            },
          },
        ],
      },
    };

    const validated = awsCompileAlbEvents.validate();

    expect(validated.events).to.deep.equal([
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
    ]);
  });
});
