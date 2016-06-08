'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const os = require('os');
const path = require('path');
const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const AwsDeploy = require('../awsDeploy');
const Serverless = require('../../../Serverless');

const serverless = new Serverless();
serverless.init();
const awsDeploy = new AwsDeploy(serverless);
const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
const serverlessEnvYamlPath = path.join(tmpDirPath, 'serverless.env.yaml');
const serverlessEnvYaml = {
  vars: {},
  stages: {
    dev: {
      vars: {},
      regions: {
        aws_useast1: {
          vars: {},
        },
      },
    },
  },
};
const compiledFunctionResourcesArrayMock = [
  {
    first: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Code: {
          S3Bucket: 'new-service-dev-aws_useast1',
          S3Key: '',
        },
        FunctionName: 'new-service-first',
        Handler: 'first.function.handler',
        MemorySize: 1024,
        Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
        Runtime: 'nodejs4.3',
        Timeout: 6,
      },
    },
  },
];
serverless.service.compiledFunctionResources = compiledFunctionResourcesArrayMock;
serverless.service.resources = { aws: { Resources: {} } };
awsDeploy.deployedFunctions = [{ name: 'first', zipFileKey: 'zipFileOfFirstFunction' }];
serverless.service.service = `service-${(new Date).getTime().toString()}`;
serverless.config.servicePath = tmpDirPath;
serverless.utils.writeFileSync(serverlessEnvYamlPath, serverlessEnvYaml);
awsDeploy.options = {
  stage: 'dev',
  region: 'us-east-1',
};
awsDeploy.CloudFormation = new AWS.CloudFormation({ region: 'us-east-1' });
BbPromise.promisifyAll(awsDeploy.CloudFormation, { suffix: 'Promised' });

describe('#update()', () => {
  let updateStackStub;

  beforeEach(() => {
    updateStackStub = sinon
      .stub(awsDeploy.CloudFormation, 'updateStackPromised').returns(BbPromise.resolve());
  });

  it('should add the S3Key to the compiled function resources before updating the stack', () => {
    awsDeploy.update().then(() => {
      expect(updateStackStub.calledOnce).to.be.equal(true);
      expect(awsDeploy.serverless.service.resources.aws.Resources
        .first.Properties.Code.S3Key).to.equal('zipFileOfFirstFunction');
      awsDeploy.CloudFormation.updateStackPromised.restore();
    });
  });

  it('should update the stack', () => {
    awsDeploy.update().then(() => {
      expect(updateStackStub.calledOnce).to.be.equal(true);
      awsDeploy.CloudFormation.updateStackPromised.restore();
    });
  });
});

describe('#monitorUpdate()', () => {
  it('should keep monitoring until UPDATE_COMPLETE stack status', () => {
    const describeStub = sinon.stub(awsDeploy.CloudFormation, 'describeStacksPromised');
    const cfDataMock = {
      StackId: 'new-service-dev',
    };
    const DescribeReturn = {
      Stacks: [
        {
          StackStatus: 'UPDATE_IN_PROGRESS',
        },
      ],
    };
    const finalDescribeReturn = {
      Stacks: [
        {
          StackStatus: 'UPDATE_COMPLETE',
        },
      ],
    };

    describeStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
    describeStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
    describeStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

    return awsDeploy.monitorUpdate(cfDataMock, 10).then((stack) => {
      expect(describeStub.callCount).to.be.equal(3);
      expect(stack.StackStatus).to.be.equal('UPDATE_COMPLETE');
      awsDeploy.CloudFormation.describeStacksPromised.restore();
    });
  });

  it('should throw an error if CloudFormation returned unusual stack status', () => {
    const describeStub = sinon.stub(awsDeploy.CloudFormation, 'describeStacksPromised');
    const cfDataMock = {
      StackId: 'new-service-dev',
    };
    const DescribeReturn = {
      Stacks: [
        {
          StackStatus: 'UPDATE_IN_PROGRESS',
        },
      ],
    };
    const finalDescribeReturn = {
      Stacks: [
        {
          StackStatus: 'UNUSUAL_STATUS',
        },
      ],
    };

    describeStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
    describeStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
    describeStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

    return awsDeploy.monitorUpdate(cfDataMock, 10).catch((e) => {
      expect(e.name).to.be.equal('ServerlessError');
      expect(describeStub.callCount).to.be.equal(3);
      awsDeploy.CloudFormation.describeStacksPromised.restore();
    });
  });
});

describe('#updateStack()', () => {
  it('should run promise chain in order', () => {
    const updateStub = sinon
      .stub(awsDeploy, 'update').returns(BbPromise.resolve());
    const monitorStub = sinon
      .stub(awsDeploy, 'monitorUpdate').returns(BbPromise.resolve());

    return awsDeploy.updateStack().then(() => {
      expect(updateStub.calledOnce).to.be.equal(true);
      expect(monitorStub.calledAfter(updateStub)).to.be.equal(true);

      awsDeploy.update.restore();
      awsDeploy.monitorUpdate.restore();
    });
  });
});
