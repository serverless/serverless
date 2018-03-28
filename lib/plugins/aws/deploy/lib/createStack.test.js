'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');

describe('createStack', () => {
  let awsDeploy;
  let sandbox;
  const tmpDirPath = testUtils.getTmpDirPath();

  const serverlessYmlPath = path.join(tmpDirPath, 'serverless.yml');
  const serverlessYml = {
    service: 'first-service',
    provider: 'aws',
    functions: {
      first: {
        handler: 'sample.handler',
      },
    },
  };

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, {}));
    serverless.utils.writeFileSync(serverlessYmlPath, serverlessYml);
    serverless.config.servicePath = tmpDirPath;
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.serverless.service.service = `service-${(new Date()).getTime().toString()}`;
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#create()', () => {
    it('should include custom stack tags', () => {
      awsDeploy.serverless.service.provider.stackTags = { STAGE: 'overridden', tag1: 'value1' };

      const createStackStub = sandbox
        .stub(awsDeploy.provider, 'request').resolves();
      sandbox.stub(awsDeploy, 'monitorStack').resolves();

      return awsDeploy.create().then(() => {
        expect(createStackStub.args[0][2].Tags)
          .to.deep.equal([
            { Key: 'STAGE', Value: 'overridden' },
            { Key: 'tag1', Value: 'value1' },
          ]);
      });
    });

    it('should use CloudFormation service role ARN if it is specified', () => {
      awsDeploy.serverless.service.provider.cfnRole = 'arn:aws:iam::123456789012:role/myrole';

      const createStackStub = sandbox
        .stub(awsDeploy.provider, 'request').resolves();
      sandbox.stub(awsDeploy, 'monitorStack').resolves();

      return awsDeploy.create().then(() => {
        expect(createStackStub.args[0][2].RoleARN)
          .to.equal('arn:aws:iam::123456789012:role/myrole');
      });
    });

    it('should use use notificationArns if it is specified', () => {
      const mytopicArn = 'arn:aws:sns::123456789012:mytopic';
      awsDeploy.serverless.service.provider.notificationArns = [mytopicArn];

      const createStackStub = sinon
        .stub(awsDeploy.provider, 'request').resolves();
      sinon.stub(awsDeploy, 'monitorStack').resolves();

      return awsDeploy.create().then(() => {
        expect(createStackStub.args[0][2].NotificationARNs)
          .to.deep.equal([mytopicArn]);
        awsDeploy.provider.request.restore();
        awsDeploy.monitorStack.restore();
      });
    });
  });

  describe('#createStack()', () => {
    it('should resolve if stack already created', () => {
      const createStub = sandbox
        .stub(awsDeploy, 'create').resolves();

      sandbox.stub(awsDeploy.provider, 'request').resolves();

      return awsDeploy.createStack().then(() => {
        expect(createStub.called).to.be.equal(false);
      });
    });

    it('should throw error if invalid stack name', () => {
      sandbox.stub(awsDeploy, 'create').resolves();
      sandbox.stub(awsDeploy.provider, 'request').resolves();
      awsDeploy.serverless.service.service = 'service-name'.repeat(100);

      return expect(awsDeploy.createStack.bind(awsDeploy))
        .to.throw(awsDeploy.serverless.classes.Error, /not valid/);
    });

    it('should set the createLater flag and resolve if deployment bucket is provided', () => {
      awsDeploy.serverless.service.provider.deploymentBucket = 'serverless';
      sandbox.stub(awsDeploy.provider, 'request').rejects(new Error('does not exist'));

      return awsDeploy.createStack().then(() => {
        expect(awsDeploy.createLater).to.equal(true);
      });
    });

    it('should throw error if describeStackResources fails for other reason than not found', () => {
      const errorMock = {
        message: 'Something went wrong.',
      };

      sandbox.stub(awsDeploy.provider, 'request').rejects(errorMock);

      const createStub = sandbox
        .stub(awsDeploy, 'create').resolves();

      return awsDeploy.createStack().catch((e) => {
        expect(createStub.called).to.be.equal(false);
        expect(e.name).to.be.equal('ServerlessError');
        expect(e.message).to.be.equal(errorMock);
      });
    });

    it('should run promise chain in order', () => {
      const errorMock = {
        message: 'does not exist',
      };

      sandbox.stub(awsDeploy.provider, 'request').rejects(errorMock);

      const createStub = sandbox
        .stub(awsDeploy, 'create').resolves();

      return awsDeploy.createStack().then(() => {
        expect(createStub.calledOnce).to.be.equal(true);
      });
    });

    it('should disable S3 Transfer Acceleration if missing Output', () => {
      const disableTransferAccelerationStub = sandbox
        .stub(awsDeploy.provider,
          'disableTransferAccelerationForCurrentDeploy').resolves();

      const describeStacksOutput = {
        Stacks: [
          {
            Outputs: [],
          },
        ],
      };
      sandbox.stub(awsDeploy.provider, 'request').resolves(describeStacksOutput);

      awsDeploy.provider.options['aws-s3-accelerate'] = true;

      return awsDeploy.createStack().then(() => {
        expect(disableTransferAccelerationStub.called).to.be.equal(true);
      });
    });

    it('should not disable S3 Transfer Acceleration if custom bucket is used', () => {
      const disableTransferAccelerationStub = sandbox
        .stub(awsDeploy.provider,
          'disableTransferAccelerationForCurrentDeploy').resolves();

      const describeStacksOutput = {
        Stacks: [
          {
            Outputs: [],
          },
        ],
      };
      sandbox.stub(awsDeploy.provider, 'request').resolves(describeStacksOutput);

      awsDeploy.provider.options['aws-s3-accelerate'] = true;
      awsDeploy.serverless.service.provider.deploymentBucket = 'my-custom-bucket';

      return awsDeploy.createStack().then(() => {
        expect(disableTransferAccelerationStub.called).to.be.equal(false);
      });
    });
  });
});
