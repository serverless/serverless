'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../provider/awsProvider');
const AwsDeploy = require('../deploy');
const Serverless = require('../../../Serverless');
const { getTmpDirPath } = require('../../../../tests/utils/fs');

describe('updateStack', () => {
  let serverless;
  let awsDeploy;
  const tmpDirPath = getTmpDirPath();

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.config.servicePath = 'foo';
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsDeploy = new AwsDeploy(serverless, options);

    awsDeploy.deployedFunctions = [{ name: 'first', zipFileKey: 'zipFileOfFirstFunction' }];
    awsDeploy.bucketName = 'deployment-bucket';
    serverless.service.service = `service-${new Date().getTime().toString()}`;
    serverless.config.servicePath = tmpDirPath;
    awsDeploy.serverless.service.package.artifactDirectoryName = 'somedir';
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#createFallback()', () => {
    let createStackStub;

    beforeEach(() => {
      createStackStub = sinon.stub(awsDeploy.provider, 'request').resolves();
      sinon.stub(awsDeploy, 'monitorStack').resolves();
    });

    afterEach(() => {
      awsDeploy.provider.request.restore();
      awsDeploy.monitorStack.restore();
    });

    it('should create a stack with the CF template URL', () => {
      const compiledTemplateFileName = 'compiled-cloudformation-template.json';

      return awsDeploy.createFallback().then(() => {
        expect(createStackStub.calledOnce).to.be.equal(true);
        expect(
          createStackStub.calledWithExactly('CloudFormation', 'createStack', {
            StackName: awsDeploy.provider.naming.getStackName(),
            OnFailure: 'ROLLBACK',
            Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
            Parameters: [],
            TemplateURL: `https://s3.amazonaws.com/${awsDeploy.bucketName}/${awsDeploy.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`,
            Tags: [{ Key: 'STAGE', Value: awsDeploy.provider.getStage() }],
          })
        ).to.be.equal(true);
      });
    });

    it('should include custom stack tags', () => {
      awsDeploy.serverless.service.provider.stackTags = { STAGE: 'overridden', tag1: 'value1' };

      return awsDeploy.createFallback().then(() => {
        expect(createStackStub.args[0][2].Tags).to.deep.equal([
          { Key: 'STAGE', Value: 'overridden' },
          { Key: 'tag1', Value: 'value1' },
        ]);
      });
    });

    it('should add CAPABILITY_AUTO_EXPAND if a Transform directive is specified', () => {
      awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = {
        Transform: 'MyMacro',
      };

      return awsDeploy.createFallback().then(() => {
        expect(createStackStub.args[0][2].Capabilities).to.contain('CAPABILITY_AUTO_EXPAND');
      });
    });

    it('should use CloudFormation service role if it is specified', () => {
      awsDeploy.serverless.service.provider.cfnRole = 'arn:aws:iam::123456789012:role/myrole';

      return awsDeploy.createFallback().then(() => {
        expect(createStackStub.args[0][2].RoleARN).to.equal(
          'arn:aws:iam::123456789012:role/myrole'
        );
      });
    });

    it('should use use notificationArns if it is specified', () => {
      const mytopicArn = 'arn:aws:sns::123456789012:mytopic';
      awsDeploy.serverless.service.provider.notificationArns = [mytopicArn];

      return awsDeploy.createFallback().then(() => {
        expect(createStackStub.args[0][2].NotificationARNs).to.deep.equal([mytopicArn]);
      });
    });
  });

  describe('#update()', () => {
    let updateStackStub;

    beforeEach(() => {
      updateStackStub = sinon.stub(awsDeploy.provider, 'request').resolves();
      sinon.stub(awsDeploy, 'monitorStack').resolves();
    });

    afterEach(() => {
      awsDeploy.provider.request.restore();
      awsDeploy.monitorStack.restore();
    });

    it('should update the stack', () =>
      awsDeploy.update().then(() => {
        const compiledTemplateFileName = 'compiled-cloudformation-template.json';
        expect(updateStackStub.calledOnce).to.be.equal(true);
        expect(
          updateStackStub.calledWithExactly('CloudFormation', 'updateStack', {
            StackName: awsDeploy.provider.naming.getStackName(),
            Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
            Parameters: [],
            TemplateURL: `https://s3.amazonaws.com/${awsDeploy.bucketName}/${awsDeploy.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`,
            Tags: [{ Key: 'STAGE', Value: awsDeploy.provider.getStage() }],
          })
        ).to.be.equal(true);
      }));

    it('should include custom stack tags and policy', () => {
      awsDeploy.serverless.service.provider.stackTags = { STAGE: 'overridden', tag1: 'value1' };
      awsDeploy.serverless.service.provider.stackPolicy = [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 'Update:*',
          Resource: '*',
        },
      ];

      return awsDeploy.update().then(() => {
        expect(updateStackStub.args[0][2].Tags).to.deep.equal([
          { Key: 'STAGE', Value: 'overridden' },
          { Key: 'tag1', Value: 'value1' },
        ]);
        expect(updateStackStub.args[0][2].StackPolicyBody).to.equal(
          '{"Statement":[{"Effect":"Allow","Principal":"*","Action":"Update:*","Resource":"*"}]}'
        );
      });
    });

    it('should success if no changes to stack happened', () => {
      awsDeploy.monitorStack.restore();
      sinon.stub(awsDeploy, 'monitorStack').rejects(new Error('No updates are to be performed.'));

      return awsDeploy.update();
    });

    it('should add CAPABILITY_AUTO_EXPAND if a Transform directive is specified', () => {
      awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = {
        Transform: 'MyMacro',
      };

      return awsDeploy.update().then(() => {
        expect(updateStackStub.args[0][2].Capabilities).to.contain('CAPABILITY_AUTO_EXPAND');
      });
    });

    it('should use CloudFormation service role if it is specified', () => {
      awsDeploy.serverless.service.provider.cfnRole = 'arn:aws:iam::123456789012:role/myrole';

      return awsDeploy.update().then(() => {
        expect(updateStackStub.args[0][2].RoleARN).to.equal(
          'arn:aws:iam::123456789012:role/myrole'
        );
      });
    });

    it('should use use notificationArns if it is specified', () => {
      const mytopicArn = 'arn:aws:sns::123456789012:mytopic';
      awsDeploy.serverless.service.provider.notificationArns = [mytopicArn];

      return awsDeploy.update().then(() => {
        expect(updateStackStub.args[0][2].NotificationARNs).to.deep.equal([mytopicArn]);
      });
    });
  });

  describe('#updateStack()', () => {
    it('should fallback to createStack if createLater flag exists', () => {
      awsDeploy.createLater = true;
      const createFallbackStub = sinon.stub(awsDeploy, 'createFallback').resolves();
      const updateStub = sinon.stub(awsDeploy, 'update').resolves();

      return awsDeploy.updateStack().then(() => {
        expect(createFallbackStub.calledOnce).to.be.equal(true);
        expect(updateStub.called).to.be.equal(false);
        awsDeploy.update.restore();
      });
    });

    it('should run promise chain in order', () => {
      const updateStub = sinon.stub(awsDeploy, 'update').resolves();

      return awsDeploy.updateStack().then(() => {
        expect(updateStub.calledOnce).to.be.equal(true);

        awsDeploy.update.restore();
      });
    });
  });
});
