'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const Serverless = require('../../../Serverless');
const AwsProvider = require('../provider/awsProvider');
const CLI = require('../../../classes/CLI');
const monitorStack = require('../lib/monitorStack');

describe('monitorStack', () => {
  const serverless = new Serverless();
  const awsPlugin = {};

  beforeEach(() => {
    awsPlugin.serverless = serverless;
    awsPlugin.provider = new AwsProvider(serverless);
    awsPlugin.serverless.cli = new CLI(serverless);
    awsPlugin.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    Object.assign(awsPlugin, monitorStack);
  });

  describe('#monitorStack()', () => {
    it('should skip monitoring if the --noDeploy option is specified', () => {
      awsPlugin.options.noDeploy = true;
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };

      return awsPlugin.monitorStack('update', cfDataMock, 10).then(() => {
        expect(describeStackEventsStub.callCount).to.be.equal(0);
        awsPlugin.provider.request.restore();
      });
    });

    it('should skip monitoring if the stack was already created', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');

      return awsPlugin.monitorStack('update', 'alreadyCreated', 10).then(() => {
        expect(describeStackEventsStub.callCount).to.be.equal(0);
        awsPlugin.provider.request.restore();
      });
    });

    it('should keep monitoring until CREATE_COMPLETE stack status', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      };
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateFinishedEvent));

      return awsPlugin.monitorStack('create', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(2);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        expect(stackStatus).to.be.equal('CREATE_COMPLETE');
        awsPlugin.provider.request.restore();
      });
    });

    it('should keep monitoring until UPDATE_COMPLETE stack status', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      };
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateFinishedEvent));

      return awsPlugin.monitorStack('update', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(2);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        expect(stackStatus).to.be.equal('UPDATE_COMPLETE');
        awsPlugin.provider.request.restore();
      });
    });

    it('should keep monitoring until DELETE_COMPLETE stack status', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      };
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateFinishedEvent));

      return awsPlugin.monitorStack('removal', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(2);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        expect(stackStatus).to.be.equal('DELETE_COMPLETE');
        awsPlugin.provider.request.restore();
      });
    });

    it('should not stop monitoring on CREATE_COMPLETE nested stack status', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      };
      const nestedStackEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4z',
            StackName: 'new-service-dev',
            LogicalResourceId: 'nested-stack-name',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_COMPLETE',
          },
        ],
      };
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(nestedStackEvent));
      describeStackEventsStub.onCall(2).returns(BbPromise.resolve(updateFinishedEvent));

      return awsPlugin.monitorStack('create', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(3);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        expect(stackStatus).to.be.equal('CREATE_COMPLETE');
        awsPlugin.provider.request.restore();
      });
    });

    it('should not stop monitoring on UPDATE_COMPLETE nested stack status', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      };
      const nestedStackEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4z',
            StackName: 'new-service-dev',
            LogicalResourceId: 'nested-stack-name',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      };
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(nestedStackEvent));
      describeStackEventsStub.onCall(2).returns(BbPromise.resolve(updateFinishedEvent));

      return awsPlugin.monitorStack('update', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(3);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        expect(stackStatus).to.be.equal('UPDATE_COMPLETE');
        awsPlugin.provider.request.restore();
      });
    });

    it('should not stop monitoring on DELETE_COMPLETE nested stack status', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      };
      const nestedStackEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4z',
            StackName: 'new-service-dev',
            LogicalResourceId: 'nested-stack-name',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
        ],
      };
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(nestedStackEvent));
      describeStackEventsStub.onCall(2).returns(BbPromise.resolve(updateFinishedEvent));

      return awsPlugin.monitorStack('removal', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(3);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        expect(stackStatus).to.be.equal('DELETE_COMPLETE');
        awsPlugin.provider.request.restore();
      });
    });

    it('should keep monitoring until DELETE_COMPLETE or stack not found catch', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      };
      const stackNotFoundError = {
        message: 'Stack new-service-dev does not exist',
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.reject(stackNotFoundError));

      return awsPlugin.monitorStack('removal', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(2);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        expect(stackStatus).to.be.equal('DELETE_COMPLETE');
        awsPlugin.provider.request.restore();
      });
    });

    it('should output all stack events information with the --verbose option', () => {
      awsPlugin.options.verbose = true;
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      };
      const updateFailedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'mochaS3',
            ResourceType: 'S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_FAILED',
            ResourceStatusReason: 'Bucket already exists',
          },
        ],
      };
      const updateRollbackEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_ROLLBACK_IN_PROGRESS',
          },
        ],
      };
      const updateRollbackComplete = {
        StackEvents: [
          {
            EventId: '1m2n3o4p',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'ROLLBACK_COMPLETE',
          },
        ],
      };
      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateFailedEvent));
      describeStackEventsStub.onCall(2).returns(BbPromise.resolve(updateRollbackEvent));
      describeStackEventsStub.onCall(3).returns(BbPromise.resolve(updateRollbackComplete));

      return awsPlugin.monitorStack('update', cfDataMock, 10).catch((e) => {
        let errorMessage = 'An error occurred while provisioning your stack: ';
        errorMessage += 'mochaS3 - Bucket already exists.';
        expect(e.name).to.be.equal('ServerlessError');
        expect(e.message).to.be.equal(errorMessage);
        expect(describeStackEventsStub.callCount).to.be.equal(4);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        awsPlugin.provider.request.restore();
      });
    });

    it('should keep monitoring when 1st ResourceType is not "AWS::CloudFormation::Stack"', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const firstNoStackResourceTypeEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'somebucket',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
          },
        ],
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      };
      const updateComplete = {
        StackEvents: [
          {
            EventId: '1m2n3o4p',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      };
      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(firstNoStackResourceTypeEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(2).returns(BbPromise.resolve(updateComplete));

      return awsPlugin.monitorStack('update', cfDataMock, 10).then(() => {
        expect(describeStackEventsStub.callCount).to.be.equal(3);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        awsPlugin.provider.request.restore();
      });
    });


    it('should catch describeStackEvents error if stack was not in deleting state', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const failedDescribeStackEvents = {
        message: 'Something went wrong.',
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.reject(failedDescribeStackEvents));

      return awsPlugin.monitorStack('update', cfDataMock, 10).catch((e) => {
        expect(e.message).to.be.equal('Something went wrong.');
        expect(describeStackEventsStub.callCount).to.be.equal(1);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        awsPlugin.provider.request.restore();
      });
    });

    it('should throw an error and exit immediataley if statck status is *_FAILED', () => {
      const describeStackEventsStub = sinon.stub(awsPlugin.provider, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            LogicalResourceId: 'mocha',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      };
      const updateFailedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            LogicalResourceId: 'mochaS3',
            ResourceType: 'S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_FAILED',
            ResourceStatusReason: 'Bucket already exists',
          },
        ],
      };
      const updateRollbackEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            LogicalResourceId: 'mocha',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_ROLLBACK_IN_PROGRESS',
          },
        ],
      };
      const updateRollbackFailedEvent = {
        StackEvents: [
          {
            EventId: '1m2n3o4p',
            LogicalResourceId: 'mocha',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_ROLLBACK_FAILED',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateFailedEvent));
      describeStackEventsStub.onCall(2).returns(BbPromise.resolve(updateRollbackEvent));
      describeStackEventsStub.onCall(3).returns(BbPromise.resolve(updateRollbackFailedEvent));

      return awsPlugin.monitorStack('update', cfDataMock, 10).catch((e) => {
        let errorMessage = 'An error occurred while provisioning your stack: ';
        errorMessage += 'mochaS3 - Bucket already exists.';
        expect(e.name).to.be.equal('ServerlessError');
        expect(e.message).to.be.equal(errorMessage);
        // callCount is 2 because Serverless will immediately exits and shows the error
        expect(describeStackEventsStub.callCount).to.be.equal(2);
        expect(describeStackEventsStub.calledWithExactly(
          'CloudFormation',
          'describeStackEvents',
          {
            StackName: cfDataMock.StackId,
          },
          awsPlugin.options.stage,
          awsPlugin.options.region
        )).to.be.equal(true);
        awsPlugin.provider.request.restore();
      });
    });
  });
});
