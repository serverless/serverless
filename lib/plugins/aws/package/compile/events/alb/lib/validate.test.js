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
              listenerArn: 'arn:aws:elasticloadbalancing:'
                + 'us-east-1:123456789012:listener/app/my-load-balancer/'
                + '50dc6c495c0c9188/f2f7dc8efc522ab2',
              priority: 1,
              conditions: {
                host: 'example.com',
                path: '/hello',
              },
            },
          },
        ],
      },
      second: {
        events: [
          {
            alb: {
              listenerArn: 'arn:aws:elasticloadbalancing:'
                + 'us-east-1:123456789012:listener/app/my-load-balancer/'
                + '50dc6c495c0c9188/f2f7dc8efc522ab2',
              priority: 2,
              conditions: {
                path: '/world',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileAlbEvents.validate();

    expect(validated.events).to.deep.equal([
      {
        functionName: 'first',
        listenerArn: 'arn:aws:elasticloadbalancing:'
          + 'us-east-1:123456789012:listener/app/my-load-balancer/'
          + '50dc6c495c0c9188/f2f7dc8efc522ab2',
        priority: 1,
        conditions: {
          host: 'example.com',
          path: '/hello',
        },
      },
      {
        functionName: 'second',
        listenerArn: 'arn:aws:elasticloadbalancing:'
          + 'us-east-1:123456789012:listener/app/my-load-balancer/'
          + '50dc6c495c0c9188/f2f7dc8efc522ab2',
        priority: 2,
        conditions: {
          path: '/world',
        },
      },
    ]);
  });
});
