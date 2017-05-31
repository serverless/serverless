'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('validateTemplate', () => {
  let awsDeploy;
  let serverless;
  let validateTemplateStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.config.servicePath = 'foo';
    serverless.setProvider('aws', new AwsProvider(serverless));
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
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

      return awsDeploy.validateTemplate().then(() => {
        expect(awsDeploy.serverless.cli.log.called).to.equal(true);
        expect(validateTemplateStub.calledOnce).to.equal(true);
        expect(validateTemplateStub.calledWithExactly(
          'CloudFormation',
          'validateTemplate',
          {
            TemplateURL: 'https://s3.amazonaws.com/deployment-bucket/somedir/compiled-cloudformation-template.json',
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.equal(true);
      });
    });

    it('should throw an error if the CloudFormation template is invalid', () => {
      validateTemplateStub.rejects({ message: 'Some error while validating' });

      return awsDeploy.validateTemplate().catch((error) => {
        expect(awsDeploy.serverless.cli.log.called).to.equal(true);
        expect(validateTemplateStub.calledOnce).to.equal(true);
        expect(validateTemplateStub.calledWithExactly(
          'CloudFormation',
          'validateTemplate',
          {
            TemplateURL: 'https://s3.amazonaws.com/deployment-bucket/somedir/compiled-cloudformation-template.json',
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.equal(true);
        expect(error.message).to.match(/is invalid: Some error while validating/);
      });
    });
  });
});
