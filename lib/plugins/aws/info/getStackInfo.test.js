'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');

describe('#getStackInfo()', () => {
  let serverless;
  let awsInfo;
  let describeStacksStub;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.service.service = 'my-service';
    serverless.service.functions = {
      hello: {},
      world: {},
    };
    awsInfo = new AwsInfo(serverless, options);

    describeStacksStub = sinon.stub(awsInfo.provider, 'request');
  });

  afterEach(() => {
    awsInfo.provider.request.restore();
  });

  it('attach info from describeStack call to this.gatheredData if result is available', () => {
    const describeStacksResponse = {
      Stacks: [
        {
          StackId: 'arn:aws:cloudformation:us-east-1:123456789012:' +
            'stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
          Description: 'AWS CloudFormation Sample Template S3_Bucket: ' +
            'Sample template showing how to create a publicly accessible S3 bucket.',
          Tags: [],
          Outputs: [
            {
              Description: 'URL of the service endpoint',
              OutputKey: 'ServiceEndpoint',
              OutputValue: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
            },
            {
              Description: 'first',
              OutputKey: 'ApiGatewayApiKey1Value',
              OutputValue: 'xxx',
            },
            {
              Description: 'second',
              OutputKey: 'ApiGatewayApiKey2Value',
              OutputValue: 'yyy',
            },
          ],
          StackStatusReason: null,
          CreationTime: '2013-08-23T01:02:15.422Z',
          Capabilities: [],
          StackName: 'myteststack',
          StackStatus: 'CREATE_COMPLETE',
          DisableRollback: false,
        },
      ],
    };

    describeStacksStub.resolves(describeStacksResponse);

    const expectedGatheredDataObj = {
      info: {
        functions: [
          {
            name: 'hello',
            deployedName: 'my-service-dev-hello',
          },
          {
            name: 'world',
            deployedName: 'my-service-dev-world',
          },
        ],
        endpoint: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
        service: 'my-service',
        stage: 'dev',
        region: 'us-east-1',
        stack: 'my-service-dev',
      },
      outputs: [
        {
          Description: 'URL of the service endpoint',
          OutputKey: 'ServiceEndpoint',
          OutputValue: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
        },
        {
          Description: 'first',
          OutputKey: 'ApiGatewayApiKey1Value',
          OutputValue: 'xxx',
        },
        {
          Description: 'second',
          OutputKey: 'ApiGatewayApiKey2Value',
          OutputValue: 'yyy',
        },
      ],
    };

    return awsInfo.getStackInfo().then(() => {
      expect(describeStacksStub.calledOnce).to.equal(true);
      expect(describeStacksStub.calledWithExactly(
        'CloudFormation',
        'describeStacks',
        {
          StackName: awsInfo.provider.naming.getStackName(),
        }
      )).to.equal(true);

      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj);
    });
  });

  it('should resolve if result is empty', () => {
    const describeStacksResponse = null;

    describeStacksStub.resolves(describeStacksResponse);

    const expectedGatheredDataObj = {
      info: {
        functions: [],
        endpoint: '',
        service: 'my-service',
        stage: 'dev',
        region: 'us-east-1',
        stack: 'my-service-dev',
      },
      outputs: [],
    };

    return awsInfo.getStackInfo().then(() => {
      expect(describeStacksStub.calledOnce).to.equal(true);
      expect(describeStacksStub.calledWithExactly(
        'CloudFormation',
        'describeStacks',
        {
          StackName: awsInfo.provider.naming.getStackName(),
        }
      )).to.equal(true);

      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj);
    });
  });
});
