'use strict';

/* eslint-disable no-unused-expressions */

const sinon = require('sinon');
const chai = require('chai');
const AwsProvider = require('../../../../../../../lib/plugins/aws/provider');
const AwsDeploy = require('../../../../../../../lib/plugins/aws/deploy/index');
const Serverless = require('../../../../../../../lib/serverless');

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
    serverless = new Serverless({ commands: [], options: {} });
    serverless.serviceDir = 'foo';
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
  });

  afterEach(() => {
    awsDeploy.provider.request.restore();
  });

  describe('#validateTemplate()', () => {
    it('should resolve if the CloudFormation template is valid', async () => {
      validateTemplateStub.resolves();

      await awsDeploy.validateTemplate();
      expect(validateTemplateStub).to.have.been.calledOnce;
      expect(validateTemplateStub).to.have.been.calledWithExactly(
        'CloudFormation',
        'validateTemplate',
        {
          TemplateURL:
            'https://s3.amazonaws.com/deployment-bucket/somedir/compiled-cloudformation-template.json',
        }
      );
    });

    it('should throw an error if the CloudFormation template is invalid', () => {
      validateTemplateStub.rejects({ message: 'Some error while validating' });

      return expect(awsDeploy.validateTemplate()).to.be.rejected.then((error) => {
        expect(validateTemplateStub).to.have.been.calledOnce;
        expect(validateTemplateStub).to.have.been.calledWithExactly(
          'CloudFormation',
          'validateTemplate',
          {
            TemplateURL:
              'https://s3.amazonaws.com/deployment-bucket/somedir/compiled-cloudformation-template.json',
          }
        );
        expect(error.message).to.match(/is invalid: Some error while validating/);
      });
    });
  });
});
