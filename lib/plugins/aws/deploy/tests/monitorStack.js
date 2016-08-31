'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('monitorStack', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);

    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#monitorStack()', () => {
    it('should skip monitoring if the --noDeploy option is specified', () => {
      awsDeploy.options.noDeploy = true;
      const describeStackEventsStub = sinon.stub(awsDeploy.sdk, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };

      return awsDeploy.monitorStack('update', cfDataMock, 10).then(() => {
        expect(describeStackEventsStub.callCount).to.be.equal(0);
        awsDeploy.sdk.request.restore();
      });
    });

    it('should skip monitoring if the stack was already created', () => {
      const describeStackEventsStub = sinon.stub(awsDeploy.sdk, 'request');

      return awsDeploy.monitorStack('update', 'alreadyCreated', 10).then(() => {
        expect(describeStackEventsStub.callCount).to.be.equal(0);
        awsDeploy.sdk.request.restore();
      });
    });

    it('should keep monitoring until CREATE_COMPLETE stack status', () => {
      const describeStackEventsStub = sinon.stub(awsDeploy.sdk, 'request');
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
            ResourceStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      };
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            LogicalResourceId: 'mocha',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateFinishedEvent));

      return awsDeploy.monitorStack('create', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(2);
        expect(describeStackEventsStub.calledWith(
          awsDeploy.options.stage,
          awsDeploy.options.region
        ));
        expect(stackStatus).to.be.equal('CREATE_COMPLETE');
        awsDeploy.sdk.request.restore();
      });
    });

    it('should keep monitoring until UPDATE_COMPLETE stack status', () => {
      const describeStackEventsStub = sinon.stub(awsDeploy.sdk, 'request');
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
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            LogicalResourceId: 'mocha',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateFinishedEvent));

      return awsDeploy.monitorStack('update', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(2);
        expect(describeStackEventsStub.calledWith(
          awsDeploy.options.stage,
          awsDeploy.options.region
        ));
        expect(stackStatus).to.be.equal('UPDATE_COMPLETE');
        awsDeploy.sdk.request.restore();
      });
    });

    it('should keep monitoring until DELETE_COMPLETE stack status', () => {
      const describeStackEventsStub = sinon.stub(awsDeploy.sdk, 'request');
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
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      };
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            LogicalResourceId: 'mocha',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateFinishedEvent));

      return awsDeploy.monitorStack('removal', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(2);
        expect(describeStackEventsStub.calledWith(
          awsDeploy.options.stage,
          awsDeploy.options.region
        ));
        expect(stackStatus).to.be.equal('DELETE_COMPLETE');
        awsDeploy.sdk.request.restore();
      });
    });

    it('should keep monitoring until DELETE_COMPLETE or stack not found catch', () => {
      const describeStackEventsStub = sinon.stub(awsDeploy.sdk, 'request');
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
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      };
      const stackNotFoundError = {
        message: 'Stack new-service-dev does not exist',
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.reject(stackNotFoundError));

      return awsDeploy.monitorStack('removal', cfDataMock, 10).then((stackStatus) => {
        expect(describeStackEventsStub.callCount).to.be.equal(2);
        expect(describeStackEventsStub.calledWith(
          awsDeploy.options.stage,
          awsDeploy.options.region
        ));
        expect(stackStatus).to.be.equal('DELETE_COMPLETE');
        awsDeploy.sdk.request.restore();
      });
    });

    it('should output all stack events information with the --verbose option', () => {
      awsDeploy.options.verbose = true;
      const describeStackEventsStub = sinon.stub(awsDeploy.sdk, 'request');
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
            ResourceStatus: 'UPDATE_ROLLBACK_COMPLETE',
          },
        ],
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.resolve(updateStartEvent));
      describeStackEventsStub.onCall(1).returns(BbPromise.resolve(updateFailedEvent));
      describeStackEventsStub.onCall(2).returns(BbPromise.resolve(updateRollbackEvent));
      describeStackEventsStub.onCall(3).returns(BbPromise.resolve(updateRollbackFailedEvent));

      return awsDeploy.monitorStack('update', cfDataMock, 10).catch((e) => {
        let errorMessage = 'An error occurred while provisioning your stack: ';
        errorMessage += 'mochaS3 - Bucket already exists.';
        expect(e.name).to.be.equal('ServerlessError');
        expect(e.message).to.be.equal(errorMessage);
        expect(describeStackEventsStub.callCount).to.be.equal(4);
        expect(describeStackEventsStub.calledWith(
          awsDeploy.options.stage,
          awsDeploy.options.region
        ));
        awsDeploy.sdk.request.restore();
      });
    });

    it('should catch describeStackEvents error if stack was not in deleting state', () => {
      const describeStackEventsStub = sinon.stub(awsDeploy.sdk, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const failedDescribeStackEvents = {
        message: 'Something went wrong.',
      };

      describeStackEventsStub.onCall(0).returns(BbPromise.reject(failedDescribeStackEvents));

      return awsDeploy.monitorStack('update', cfDataMock, 10).catch((e) => {
        expect(e.message).to.be.equal('Something went wrong.');
        expect(describeStackEventsStub.callCount).to.be.equal(1);
        expect(describeStackEventsStub.calledWith(
          awsDeploy.options.stage,
          awsDeploy.options.region
        ));
        awsDeploy.sdk.request.restore();
      });
    });

    it('should throw an error if CloudFormation returned unusual stack status', () => {
      const describeStackEventsStub = sinon.stub(awsDeploy.sdk, 'request');
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

      return awsDeploy.monitorStack('update', cfDataMock, 10).catch((e) => {
        let errorMessage = 'An error occurred while provisioning your stack: ';
        errorMessage += 'mochaS3 - Bucket already exists.';
        expect(e.name).to.be.equal('ServerlessError');
        expect(e.message).to.be.equal(errorMessage);
        expect(describeStackEventsStub.callCount).to.be.equal(4);
        expect(describeStackEventsStub.calledWith(
          awsDeploy.options.stage,
          awsDeploy.options.region
        ));
        awsDeploy.sdk.request.restore();
      });
    });
  });
});
