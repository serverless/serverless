'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const AwsResourcesDeploy = require('../awsResourcesDeploy');
const Serverless = require('../../../Serverless');
const serverless = new Serverless();

describe('Create', () => {
  let awsResourcesDeploy;

  before(() => {
    awsResourcesDeploy = new AwsResourcesDeploy(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(awsResourcesDeploy.commands).to.be.not.empty);

    it('should have hooks', () => expect(awsResourcesDeploy.hooks).to.be.not.empty);
  });


  describe('#validate()', () => {
    before(() => {
      awsResourcesDeploy.options.cfTemplate = true;
      awsResourcesDeploy.options.stage = 'dev';
      awsResourcesDeploy.options.region = 'aws_useast_1';
      awsResourcesDeploy.serverless.service.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {
              aws_useast_1: {
                vars: {},
              },
            },
          },
        },
      };
    });

    it('should generate greeting if interactive', () => {
      awsResourcesDeploy.serverless.config.interactive = true;
      const greetingStub = sinon.stub(awsResourcesDeploy.serverless.cli, 'asciiGreeting');
      return awsResourcesDeploy.validate().then(() => {
        expect(greetingStub.calledOnce).to.be.equal(true);
        awsResourcesDeploy.serverless.cli.asciiGreeting.restore();
        awsResourcesDeploy.serverless.config.interactive = false;
      });
    });

    it('should NOT generate greeting if not interactive', () => {
      const greetingStub = sinon.stub(awsResourcesDeploy.serverless.cli, 'asciiGreeting');
      return awsResourcesDeploy.validate().then(() => {
        expect(greetingStub.notCalled).to.be.equal(true);
        awsResourcesDeploy.serverless.cli.asciiGreeting.restore();
      });
    });

    it('should attach CloudFormation instance to context', () => awsResourcesDeploy.validate()
      .then(() => expect(typeof awsResourcesDeploy.CloudFormation).to.not.be.equal('undefined'))
    );

    it('should log "Deploying Resources to AWS..."', () => {
      const logStub = sinon.stub(awsResourcesDeploy.serverless.cli, 'log');
      return awsResourcesDeploy.validate().then(() => {
        expect(logStub.calledOnce).to.be.equal(true);
        awsResourcesDeploy.serverless.cli.log.restore();
      });
    });

    // it('should start spinner', () => {
    //   const spinnerStub = sinon.stub(awsResourcesDeploy.serverless.cli, 'spinner');
    //   return awsResourcesDeploy.validate().then(() => {
    //     expect(spinnerStub.calledOnce).to.be.equal(true);
    //     awsResourcesDeploy.serverless.cli.spinner.restore();
    //   });
    // });

    it('should throw error if cfTemplate is missing', () => {
      awsResourcesDeploy.options.cfTemplate = false;
      expect(() => awsResourcesDeploy.validate()).to.throw(Error);
      awsResourcesDeploy.options.cfTemplate = true;
    });

    it('should throw error if stage is missing', () => {
      awsResourcesDeploy.options.stage = false;
      expect(() => awsResourcesDeploy.validate()).to.throw(Error);
      awsResourcesDeploy.options.stage = 'dev';
    });

    it('should throw error if region is missing', () => {
      awsResourcesDeploy.options.region = false;
      expect(() => awsResourcesDeploy.validate()).to.throw(Error);
      awsResourcesDeploy.options.region = 'aws_useast1';
    });

    it('should throw error if stage does not exist in service', () => {
      awsResourcesDeploy.options.stage = 'prod';
      expect(() => awsResourcesDeploy.validate()).to.throw(Error);
      awsResourcesDeploy.options.stage = 'dev';
    });

    it('should throw error if region does not exist in service', () => {
      awsResourcesDeploy.options.region = 'aws_uswest2';
      expect(() => awsResourcesDeploy.validate()).to.throw(Error);
      awsResourcesDeploy.options.region = 'aws_useast1';
    });
  });

  describe('#createOrUpdate()', () => {
    beforeEach(() => {
      awsResourcesDeploy.options.stage = 'dev';
      awsResourcesDeploy.options.region = 'us-east-1';
      awsResourcesDeploy.serverless.service.service = 'new-service';
      awsResourcesDeploy.options.cfTemplate = {};
      const config = {
        region: 'us-east-1',
      };
      awsResourcesDeploy.CloudFormation = new AWS.CloudFormation(config);
      BbPromise.promisifyAll(awsResourcesDeploy.CloudFormation, { suffix: 'Promised' });
    });

    afterEach(() => {
      awsResourcesDeploy.CloudFormation.describeStackResourcesPromised.restore();
    });
    it('should throw any other CloudFormation error', () => {
      const errorMock = {
        message: '',
      };

      // the stub should return a promise rejection not an actual Error, so we're mocking it.
      // notice the use of stub.returns rather than stub.throws
      const describeStub = sinon.stub(awsResourcesDeploy.CloudFormation, 'describeStackResourcesPromised')
        .returns(BbPromise.reject(errorMock));

      // we're not asserting throwing an error, we're asserting rejection handling
      // notice the use of .catch instead of .then
      return awsResourcesDeploy.createOrUpdate().catch((e) => {
        // we're not using expect.to.throw, but rather asserting we're getting the right rejection
        expect(e.name).to.be.equal('ServerlessError');
        expect(awsResourcesDeploy.stackName).to.be.equal('new-service-dev');
        expect(describeStub.calledOnce).to.be.equal(true);
        const paramsMock = {
          StackName: 'new-service-dev',
        };
        expect(describeStub.calledWith(paramsMock)).to.be.equal(true);
      });
    });

    it('should create stack if it does not exist', () => {
      const errorMock = {
        message: 'does not exist',
      };

      sinon.stub(awsResourcesDeploy.CloudFormation, 'describeStackResourcesPromised')
        .returns(BbPromise.reject(errorMock));

      const createStackStub = sinon.stub(awsResourcesDeploy.CloudFormation, 'createStackPromised');

      return awsResourcesDeploy.createOrUpdate().then(() => {
        expect(createStackStub.calledOnce).to.be.equal(true);
        awsResourcesDeploy.CloudFormation.createStackPromised.restore();
      });
    });

    it('should update stack if it already exists', () => {
      sinon.stub(awsResourcesDeploy.CloudFormation, 'describeStackResourcesPromised')
        .returns(BbPromise.resolve());

      const updateStackStub = sinon.stub(awsResourcesDeploy.CloudFormation, 'updateStackPromised');

      return awsResourcesDeploy.createOrUpdate().then(() => {
        expect(updateStackStub.calledOnce).to.be.equal(true);
        const paramsMock = {
          Capabilities: [
            'CAPABILITY_IAM',
          ],
          Parameters: [],
          TemplateBody: JSON.stringify(awsResourcesDeploy.options.cfTemplate),
          StackName: 'new-service-dev',
        };
        expect(updateStackStub.calledWith(paramsMock)).to.be.equal(true);
        awsResourcesDeploy.CloudFormation.updateStackPromised.restore();
      });
    });

    it('should resolve if no updates to be performed', () => {
      const errorMock = {
        message: 'No updates are to be performed.',
      };

      sinon.stub(awsResourcesDeploy.CloudFormation, 'describeStackResourcesPromised')
        .returns(BbPromise.reject(errorMock));

      return awsResourcesDeploy.createOrUpdate().then((noUpdatesString) => {
        expect(noUpdatesString).to.be.equal('No resource updates are to be performed.');
      });
    });
  });

  describe('#monitor()', () => {

  });

  describe('#addOutputVariables()', () => {

  });

  describe('#finish()', () => {

  });
});
