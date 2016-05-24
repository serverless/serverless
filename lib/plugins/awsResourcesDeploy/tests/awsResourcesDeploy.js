'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
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

  });

  describe('#monitor()', () => {

  });

  describe('#addOutputVariables()', () => {

  });

  describe('#finish()', () => {

  });
});
