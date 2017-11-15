'use strict';

const sinon = require('sinon');
const path = require('path');
const chai = require('chai');
const AwsProvider = require('../../provider/awsProvider');
const Serverless = require('../../../../Serverless');
const validate = require('../../lib/validate');
const generateCoreTemplate = require('./generateCoreTemplate');
const testUtils = require('../../../../../tests/utils');
const expect = require('chai').expect;

chai.use(require('chai-as-promised'));

describe('#generateCoreTemplate()', () => {
  let serverless;
  const awsPlugin = {};
  const functionName = 'test';

  beforeEach(() => {
    serverless = new Serverless();
    awsPlugin.serverless = serverless;
    awsPlugin.provider = new AwsProvider(serverless, {});
    awsPlugin.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    Object.assign(awsPlugin, generateCoreTemplate, validate);

    awsPlugin.serverless.cli = new serverless.classes.CLI();
    awsPlugin.serverless.config.servicePath = testUtils.getTmpDirPath();

    awsPlugin.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsPlugin.serverless.service.service = 'new-service';
    awsPlugin.serverless.service.functions = {
      [functionName]: {
        name: 'test',
        artifact: 'test.zip',
        handler: 'handler.hello',
      },
    };
  });

  it('should use a custom bucket if specified', () => {
    const bucketName = 'com.serverless.deploys';

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;

    const coreCloudFormationTemplate = awsPlugin.serverless.utils.readFileSync(
      path.join(
        __dirname,
        'core-cloudformation-template.json'
      )
    );
    awsPlugin.serverless.service.provider
      .compiledCloudFormationTemplate = coreCloudFormationTemplate;

    return expect(awsPlugin.generateCoreTemplate()).to.be.fulfilled
      .then(() => {
        expect(
          awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value
        ).to.equal(bucketName);
        // eslint-disable-next-line no-unused-expressions
        expect(
          awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket
        ).to.not.exist;
      });
  });

  it('should use a auto generated bucket if you does not specify deploymentBucket', () =>
    expect(awsPlugin.generateCoreTemplate()).to.be.fulfilled.then(() => {
      expect(
        awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucket
        ).to.be.deep.equal({
          Type: 'AWS::S3::Bucket',
          Properties: {
            AccelerateConfiguration: {
              AccelerationStatus: 'Suspended',
            },
          },
        });
    })
  );

  it('should add a deployment bucket to the CF template, if not provided', () => {
    sinon.stub(awsPlugin.provider, 'request').resolves();
    sinon.stub(serverless.utils, 'writeFileSync').resolves();
    serverless.config.servicePath = './';

    return awsPlugin.generateCoreTemplate()
      .then(() => {
        const template = serverless.service.provider.coreCloudFormationTemplate;
        expect(template).to.not.equal(null);
      });
  });

  it('should add a custom output if S3 Transfer Acceleration is enabled', () => {
    sinon.stub(awsPlugin.provider, 'request').resolves();
    sinon.stub(serverless.utils, 'writeFileSync').resolves();
    serverless.config.servicePath = './';
    awsPlugin.provider.options['aws-s3-accelerate'] = true;

    return awsPlugin.generateCoreTemplate()
      .then(() => {
        const template = serverless.service.provider.coreCloudFormationTemplate;
        expect(template.Outputs.ServerlessDeploymentBucketAccelerated).to.not.equal(null);
        expect(template.Outputs.ServerlessDeploymentBucketAccelerated.Value).to.equal(true);
      });
  });
});
