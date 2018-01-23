'use strict';

/* eslint-disable no-unused-expressions */

const sinon = require('sinon');
const chai = require('chai');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('validateTemplate', () => {
  let awsDeploy;
  let serverless;
  let validateTemplateStub;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.config.servicePath = 'foo';
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.service.package.artifactDirectoryName = 'somedir';
    awsDeploy.serverless.service.functions = {
      first: {
        handler: 'foo',
      },
    };
    validateTemplateStub = sinon.stub(awsDeploy.provider, 'request');
    awsDeploy.serverless.cli = {
      log: sinon.spy(),
    };
  });

  afterEach(() => {
    awsDeploy.provider.request.restore();
  });

  describe('#validateTemplate()', () => {
    it('should resolve if the CloudFormation template is valid', () => {
      validateTemplateStub.resolves();

      return expect(awsDeploy.validateTemplate()).to.be.fulfilled.then(() => {
        expect(awsDeploy.serverless.cli.log).to.have.been.called;
        expect(validateTemplateStub).to.have.been.calledOnce;
        expect(validateTemplateStub).to.have.been.calledWithExactly(
          'CloudFormation',
          'validateTemplate',
          {
            TemplateURL: 'https://s3.amazonaws.com/deployment-bucket/somedir/compiled-cloudformation-template.json',
          }
        );
      });
    });

    it('should throw an error if the CloudFormation template is invalid', () => {
      validateTemplateStub.rejects({ message: 'Some error while validating' });

      return expect(awsDeploy.validateTemplate()).to.be.rejected.then((error) => {
        expect(awsDeploy.serverless.cli.log).to.have.been.called;
        expect(validateTemplateStub).to.have.been.calledOnce;
        expect(validateTemplateStub).to.have.been.calledWithExactly(
          'CloudFormation',
          'validateTemplate',
          {
            TemplateURL: 'https://s3.amazonaws.com/deployment-bucket/somedir/compiled-cloudformation-template.json',
          }
        );
        expect(error.message).to.match(/is invalid: Some error while validating/);
      });
    });
  });
});
