'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const os = require('os');
const path = require('path');
const BbPromise = require('bluebird');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('updateStack', () => {
  let serverless;
  let awsDeploy;

  const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
  const serverlessEnvYamlPath = path.join(tmpDirPath, 'serverless.env.yaml');
  const serverlessEnvYaml = {
    vars: {},
    stages: {
      dev: {
        vars: {},
        regions: {
          'us-east-1': {
            vars: {},
          },
        },
      },
    },
  };

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      first: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: 'new-service-dev-us-east-1',
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
      coreBucket: {
        Type: 'AWS::S3::Bucket',
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);

    awsDeploy.serverless.service.resources = serviceResourcesAwsResourcesObjectMock;
    awsDeploy.deployedFunctions = [{ name: 'first', zipFileKey: 'zipFileOfFirstFunction' }];
    serverless.service.service = `service-${(new Date).getTime().toString()}`;
    serverless.config.servicePath = tmpDirPath;
    serverless.utils.writeFileSync(serverlessEnvYamlPath, serverlessEnvYaml);

    // TODO remove this ASAP as this should be set when Serverless is initialized
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#update()', () => {
    let updateStackStub;

    beforeEach(() => {
      updateStackStub = sinon
        .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());
    });

    it('should add the S3Key to the compiled function resources before updating the stack',
      () => awsDeploy.update().then(() => {
        expect(updateStackStub.calledOnce).to.be.equal(true);
        expect(updateStackStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        expect(awsDeploy.serverless.service.resources.Resources
          .first.Properties.Code.S3Key).to.equal('zipFileOfFirstFunction');

        awsDeploy.sdk.request.restore();
      })
    );

    it('should update the stack', () => awsDeploy.update()
      .then(() => {
        expect(updateStackStub.calledOnce).to.be.equal(true);
        expect(updateStackStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));

        awsDeploy.sdk.request.restore();
      })
    );
  });

  describe('#monitorUpdate()', () => {
    it('should keep monitoring until UPDATE_COMPLETE stack status', () => {
      const describeStacksStub = sinon.stub(awsDeploy.sdk, 'request');
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

      describeStacksStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

      return awsDeploy.monitorUpdate(cfDataMock, 10).then((stack) => {
        expect(describeStacksStub.callCount).to.be.equal(3);
        expect(describeStacksStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        expect(stack.StackStatus).to.be.equal('UPDATE_COMPLETE');
        awsDeploy.sdk.request.restore();
      });
    });

    it('should throw an error if CloudFormation returned unusual stack status', () => {
      const describeStacksStub = sinon.stub(awsDeploy.sdk, 'request');
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

      describeStacksStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

      return awsDeploy.monitorUpdate(cfDataMock, 10).catch((e) => {
        expect(e.name).to.be.equal('ServerlessError');
        expect(describeStacksStub.callCount).to.be.equal(3);
        expect(describeStacksStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.sdk.request.restore();
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
});
