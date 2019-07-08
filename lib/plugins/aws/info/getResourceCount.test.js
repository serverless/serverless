'use strict';

const chai = require('chai');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');

describe('#getResourceCount()', () => {
  let serverless;
  let awsInfo;
  let listStackResourcesStub;

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

    listStackResourcesStub = sinon.stub(awsInfo.provider, 'request');
  });

  afterEach(() => {
    awsInfo.provider.request.restore();
  });

  it('attach resourceCount to this.gatheredData after listStackResources call', () => {
    const listStackResourcesResponse = {
      ResponseMetadata: { RequestId: '81386aed-258b-11e8-b3e8-a937105b7db3' },
      StackResourceSummaries: [
        {
          LogicalResourceId: 'ApiGatewayDeployment1520814106863',
          PhysicalResourceId: 'eoa2a2',
          ResourceType: 'AWS::ApiGateway::Deployment',
          LastUpdatedTimestamp: '2018-03-12T00:22:40.680Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'ApiGatewayMethodHelloGet',
          PhysicalResourceId: 'hello-ApiGa-11R27BUE48W38',
          ResourceType: 'AWS::ApiGateway::Method',
          LastUpdatedTimestamp: '2018-03-12T00:22:37.478Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'ApiGatewayResourceHello',
          PhysicalResourceId: 'az5f7l',
          ResourceType: 'AWS::ApiGateway::Resource',
          LastUpdatedTimestamp: '2018-03-12T00:22:22.916Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'ApiGatewayRestApi',
          PhysicalResourceId: 'n1uk4p7kl0',
          ResourceType: 'AWS::ApiGateway::RestApi',
          LastUpdatedTimestamp: '2018-03-12T00:22:19.768Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'HelloLambdaFunction',
          PhysicalResourceId: 'hello-world-2-dev-hello',
          ResourceType: 'AWS::Lambda::Function',
          LastUpdatedTimestamp: '2018-03-12T00:22:34.095Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'HelloLambdaPermissionApiGateway',
          PhysicalResourceId: 'hello-world-2-dev-HelloLambdaPermissionApiGateway-18KKZXJG1DPF5',
          ResourceType: 'AWS::Lambda::Permission',
          LastUpdatedTimestamp: '2018-03-12T00:22:46.950Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'HelloLambdaVersiongZDaMtQjEhvXacHdpTLnQ61zDCdI2IWVYCbuE50pj8',
          PhysicalResourceId:
            'arn:aws:lambda:us-east-1:111111111:function:hello-world-2-dev-hello:2',
          ResourceType: 'AWS::Lambda::Version',
          LastUpdatedTimestamp: '2018-03-12T00:22:37.256Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'HelloLogGroup',
          PhysicalResourceId: '/aws/lambda/hello-world-2-dev-hello',
          ResourceType: 'AWS::Logs::LogGroup',
          LastUpdatedTimestamp: '2018-03-12T00:22:20.095Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'IamRoleLambdaExecution',
          PhysicalResourceId: 'hello-world-2-dev-us-east-1-lambdaRole',
          ResourceType: 'AWS::IAM::Role',
          LastUpdatedTimestamp: '2018-03-12T00:22:30.995Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'ServerlessDeploymentBucket',
          PhysicalResourceId: 'hello-world-2-dev-serverlessdeploymentbucket-1e3l68m8zaz7i',
          ResourceType: 'AWS::S3::Bucket',
          LastUpdatedTimestamp: '2018-03-12T00:22:11.380Z',
          ResourceStatus: 'CREATE_COMPLETE',
        },
      ],
    };

    listStackResourcesStub.resolves(listStackResourcesResponse);

    awsInfo.gatheredData = {
      info: {
        functions: [],
        endpoints: [],
        service: '',
        stage: '',
        region: '',
        stack: '',
      },
      outputs: [],
    };

    return expect(awsInfo.getResourceCount()).to.be.fulfilled.then(() => {
      expect(listStackResourcesStub.calledOnce).to.equal(true);
      expect(
        listStackResourcesStub.calledWithExactly('CloudFormation', 'listStackResources', {
          StackName: awsInfo.provider.naming.getStackName(),
        })
      ).to.equal(true);

      expect(awsInfo.gatheredData.info.resourceCount).to.equal(10);
    });
  });
});
