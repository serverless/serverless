'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');

describe('#getStackInfo()', () => {
  let serverless;
  let awsInfo;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'my-service';
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsInfo = new AwsInfo(serverless, options);
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
              Description: 'Lambda function info',
              OutputKey: 'HelloLambdaFunctionArn',
              OutputValue: 'arn:aws:iam::12345678:function:hello',
            },
            {
              Description: 'Lambda function info',
              OutputKey: 'WorldLambdaFunctionArn',
              OutputValue: 'arn:aws:iam::12345678:function:world',
            },
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

    const describeStackStub = sinon.stub(awsInfo.provider, 'request')
      .returns(BbPromise.resolve(describeStacksResponse));

    const expectedGatheredDataObj = {
      info: {
        functions: [
          {
            arn: 'arn:aws:iam::12345678:function:hello',
            name: 'hello',
          },
          {
            arn: 'arn:aws:iam::12345678:function:world',
            name: 'world',
          },
        ],
        endpoint: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
        service: 'my-service',
        stage: 'dev',
        region: 'us-east-1',
      },
      outputs: [
        {
          Description: 'Lambda function info',
          OutputKey: 'HelloLambdaFunctionArn',
          OutputValue: 'arn:aws:iam::12345678:function:hello',
        },
        {
          Description: 'Lambda function info',
          OutputKey: 'WorldLambdaFunctionArn',
          OutputValue: 'arn:aws:iam::12345678:function:world',
        },
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
      expect(describeStackStub.calledOnce).to.equal(true);
      expect(describeStackStub.calledWithExactly(
        'CloudFormation',
        'describeStacks',
        {
          StackName: awsInfo.provider.naming.getStackName(),
        },
        awsInfo.options.stage,
        awsInfo.options.region
      )).to.equal(true);

      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj);
    });
  });

  it('should resolve if result is empty', () => {
    const describeStacksResponse = null;

    const describeStackStub = sinon.stub(awsInfo.provider, 'request')
      .returns(BbPromise.resolve(describeStacksResponse));

    const expectedGatheredDataObj = {
      info: {
        functions: [],
        endpoint: '',
        service: 'my-service',
        stage: 'dev',
        region: 'us-east-1',
      },
      outputs: [],
    };

    return awsInfo.getStackInfo().then(() => {
      expect(describeStackStub.calledOnce).to.equal(true);
      expect(describeStackStub.calledWithExactly(
        'CloudFormation',
        'describeStacks',
        {
          StackName: awsInfo.provider.naming.getStackName(),
        },
        awsInfo.options.stage,
        awsInfo.options.region
      )).to.equal(true);

      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj);
    });
  });
});
