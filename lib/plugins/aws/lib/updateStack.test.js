'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const BbPromise = require('bluebird');
const AwsProvider = require('../provider/awsProvider');
const AwsDeploy = require('../deploy');
const Serverless = require('../../../Serverless');
const testUtils = require('../../../../tests/utils');

describe('updateStack', () => {
  let serverless;
  let awsDeploy;
  const tmpDirPath = testUtils.getTmpDirPath();

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);

    awsDeploy.deployedFunctions = [{ name: 'first', zipFileKey: 'zipFileOfFirstFunction' }];
    awsDeploy.bucketName = 'deployment-bucket';
    serverless.service.service = `service-${(new Date()).getTime().toString()}`;
    serverless.config.servicePath = tmpDirPath;
    awsDeploy.serverless.service.package.artifactDirectoryName = 'somedir';
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#createFallback()', () => {
    it('should create a stack with the CF template URL', () => {
      const createStackStub = sinon
        .stub(awsDeploy.provider, 'request').returns(BbPromise.resolve());
      sinon.stub(awsDeploy, 'monitorStack').returns(BbPromise.resolve());

      return awsDeploy.createFallback().then(() => {
        expect(createStackStub.calledOnce).to.be.equal(true);
        expect(createStackStub.calledWithExactly(
          'CloudFormation',
          'createStack',
          {
            StackName: awsDeploy.provider.naming.getStackName(),
            OnFailure: 'ROLLBACK',
            Capabilities: [
              'CAPABILITY_IAM',
              'CAPABILITY_NAMED_IAM',
            ],
            Parameters: [],
            TemplateURL: `https://s3.amazonaws.com/${awsDeploy.bucketName}/${awsDeploy.serverless
              .service.package.artifactDirectoryName}/compiled-cloudformation-template.json`,
            Tags: [{ Key: 'STAGE', Value: awsDeploy.options.stage }],
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
        awsDeploy.provider.request.restore();
        awsDeploy.monitorStack.restore();
      });
    });

    it('should include custom stack tags', () => {
      awsDeploy.serverless.service.provider.stackTags = { STAGE: 'overridden', tag1: 'value1' };

      const createStackStub = sinon
        .stub(awsDeploy.provider, 'request').returns(BbPromise.resolve());
      sinon.stub(awsDeploy, 'monitorStack').returns(BbPromise.resolve());

      return awsDeploy.createFallback().then(() => {
        expect(createStackStub.args[0][2].Tags)
          .to.deep.equal([
            { Key: 'STAGE', Value: 'overridden' },
            { Key: 'tag1', Value: 'value1' },
          ]);
        awsDeploy.provider.request.restore();
        awsDeploy.monitorStack.restore();
      });
    });
  });

  describe('#update()', () => {
    let updateStackStub;

    beforeEach(() => {
      updateStackStub = sinon
        .stub(awsDeploy.provider, 'request').returns(BbPromise.resolve());
      sinon.stub(awsDeploy, 'monitorStack').returns(BbPromise.resolve());
    });

    afterEach(() => {
      updateStackStub.restore();
      awsDeploy.monitorStack.restore();
    });

    it('should update the stack', () => awsDeploy.update()
      .then(() => {
        expect(updateStackStub.calledOnce).to.be.equal(true);
        expect(updateStackStub.calledWithExactly(
          'CloudFormation',
          'updateStack',
          {
            StackName: awsDeploy.provider.naming.getStackName(),
            Capabilities: [
              'CAPABILITY_IAM',
              'CAPABILITY_NAMED_IAM',
            ],
            Parameters: [],
            TemplateURL: `https://s3.amazonaws.com/${awsDeploy.bucketName}/${awsDeploy.serverless
              .service.package.artifactDirectoryName}/compiled-cloudformation-template.json`,
            Tags: [{ Key: 'STAGE', Value: awsDeploy.options.stage }],
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
      })
    );

    it('should include custom stack tags and policy', () => {
      awsDeploy.serverless.service.provider.stackTags = { STAGE: 'overridden', tag1: 'value1' };
      awsDeploy.serverless.service.provider.stackPolicy = [{
        Effect: 'Allow',
        Principal: '*',
        Action: 'Update:*',
        Resource: '*',
      }];

      return awsDeploy.update().then(() => {
        expect(updateStackStub.args[0][2].Tags)
          .to.deep.equal([
            { Key: 'STAGE', Value: 'overridden' },
            { Key: 'tag1', Value: 'value1' },
          ]);
        expect(updateStackStub.args[0][2].StackPolicyBody)
          .to.equal(
            '{"Statement":[{"Effect":"Allow","Principal":"*","Action":"Update:*","Resource":"*"}]}'
          );
      });
    });

    it('should success if no changes to stack happened', () => {
      awsDeploy.monitorStack.restore();
      sinon.stub(awsDeploy, 'monitorStack').returns(
        BbPromise.reject(new Error('No updates are to be performed.'))
      );

      return awsDeploy.update();
    });
  });

  describe('#updateStack()', () => {
    it('should resolve if no deploy', () => {
      awsDeploy.options.noDeploy = true;

      const writeUpdateTemplateStub = sinon
        .stub(awsDeploy, 'writeUpdateTemplateToDisk').returns();
      const updateStub = sinon
        .stub(awsDeploy, 'update').returns(BbPromise.resolve());

      return awsDeploy.updateStack().then(() => {
        expect(writeUpdateTemplateStub.calledOnce).to.be.equal(true);
        expect(updateStub.called).to.be.equal(false);

        awsDeploy.writeUpdateTemplateToDisk.restore();
        awsDeploy.update.restore();
      });
    });

    it('should fallback to createStack if createLater flag exists', () => {
      awsDeploy.createLater = true;

      const writeUpdateTemplateStub = sinon
        .stub(awsDeploy, 'writeUpdateTemplateToDisk').returns();
      const createFallbackStub = sinon
        .stub(awsDeploy, 'createFallback').returns(BbPromise.resolve());
      const updateStub = sinon
        .stub(awsDeploy, 'update').returns(BbPromise.resolve());

      return awsDeploy.updateStack().then(() => {
        expect(writeUpdateTemplateStub.calledOnce).to.be.equal(true);
        expect(createFallbackStub.calledOnce).to.be.equal(true);
        expect(updateStub.called).to.be.equal(false);

        awsDeploy.writeUpdateTemplateToDisk.restore();
        awsDeploy.update.restore();
      });
    });

    it('should write the template to disk even if the noDeploy option was not used', () => {
      awsDeploy.options.noDeploy = false;

      const writeUpdateTemplateStub = sinon
        .stub(awsDeploy, 'writeUpdateTemplateToDisk').returns();
      const updateStub = sinon
        .stub(awsDeploy, 'update').returns(BbPromise.resolve());

      return awsDeploy.updateStack().then(() => {
        expect(writeUpdateTemplateStub.calledOnce).to.be.equal(true);
        expect(updateStub.called).to.be.equal(true);

        awsDeploy.writeUpdateTemplateToDisk.restore();
        awsDeploy.update.restore();
      });
    });

    it('should run promise chain in order', () => {
      const updateStub = sinon
        .stub(awsDeploy, 'update').returns(BbPromise.resolve());

      return awsDeploy.updateStack().then(() => {
        expect(updateStub.calledOnce).to.be.equal(true);

        awsDeploy.update.restore();
      });
    });
  });

  describe('#writeUpdateTemplateToDisk', () => {
    it('should write the compiled CloudFormation template into the .serverless directory', () => {
      awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = { key: 'value' };

      const templatePath = path.join(tmpDirPath,
        '.serverless',
        'cloudformation-template-update-stack.json');

      return awsDeploy.writeUpdateTemplateToDisk().then(() => {
        expect(serverless.utils.fileExistsSync(templatePath)).to.equal(true);
        expect(serverless.utils.readFileSync(templatePath)).to.deep.equal({ key: 'value' });
      });
    });
  });
});
