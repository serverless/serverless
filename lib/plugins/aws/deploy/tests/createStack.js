'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const BbPromise = require('bluebird');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');

describe('createStack', () => {
  let serverless;
  let awsDeploy;
  const tmpDirPath = testUtils.getTmpDirPath();
  const serverlessEnvYmlPath = path.join(tmpDirPath, 'serverless.env.yml');

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
    serverless = new Serverless();
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

  describe('#create()', () => {
    it('should create a stack with the core CloudFormation template', () => {
      const coreCloudFormationTemplate = awsDeploy.serverless.utils.readFileSync(
        path.join(__dirname,
          '..',
          'lib',
          'core-cloudformation-template.json')
      );

      const createStackStub = sinon
        .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      return awsDeploy.create().then(() => {
        expect(createStackStub.args[0][1]).to.equal('createStack');
        expect(JSON.parse(createStackStub.args[0][2].TemplateBody))
          .to.deep.equal(coreCloudFormationTemplate);
        expect(createStackStub.calledOnce).to.be.equal(true);
        expect(createStackStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.sdk.request.restore();
      });
    });
  });

  describe('#monitorCreate()', () => {
    it('should keep monitoring until CREATE_COMPLETE stack status', () => {
      const describeStacksStub = sinon.stub(awsDeploy.sdk, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const DescribeReturn = {
        Stacks: [
          {
            StackStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      };
      const FinalDescribeReturn = {
        Stacks: [
          {
            StackStatus: 'CREATE_COMPLETE',
          },
        ],
      };

      describeStacksStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(2).returns(BbPromise.resolve(FinalDescribeReturn));

      return awsDeploy.monitorCreate(cfDataMock, 10).then((stack) => {
        expect(describeStacksStub.callCount).to.be.equal(3);
        expect(stack.StackStatus).to.be.equal('CREATE_COMPLETE');
        expect(describeStacksStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.sdk.request.restore();
      });
    });

    it('should throw an error if CloudFormation returned unusual stack status', () => {
      const describeStacksStub = sinon.stub(awsDeploy.sdk, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const DescribeReturn = {
        Stacks: [
          {
            StackStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      };
      const FinalDescribeReturn = {
        Stacks: [
          {
            StackStatus: 'UNUSUAL_STATUS',
          },
        ],
      };

      describeStacksStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(2).returns(BbPromise.resolve(FinalDescribeReturn));

      return awsDeploy.monitorCreate(cfDataMock, 10).catch((e) => {
        expect(e.name).to.be.equal('ServerlessError');
        expect(describeStacksStub.callCount).to.be.equal(3);
        expect(describeStacksStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.sdk.request.restore();
      });
    });
  });

  describe('#postCreate()', () => {
    it('should resolve', (done) => {
      awsDeploy.postCreate().then(() => done());
    });
  });

  describe('#createStack()', () => {
    beforeEach(() => {
      awsDeploy.serverless.service.environment.stages = {
        dev: {
          regions: {
            'us-east-1': {
              vars: {},
            },
          },
        },
      };
    });

    it('should store the core CloudFormation template in the provider object', () => {
      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      const coreCloudFormationTemplate = awsDeploy.loadCoreCloudFormationTemplate();

      return awsDeploy.createStack().then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate)
          .to.deep.equal(coreCloudFormationTemplate);

        awsDeploy.sdk.request.restore();
      });
    });

    it('should resolve if stack already created', () => {
      const createStub = sinon
        .stub(awsDeploy, 'create').returns(BbPromise.resolve());

      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      return awsDeploy.createStack().then(() => {
        expect(createStub.called).to.be.equal(false);
        awsDeploy.create.restore();
        awsDeploy.sdk.request.restore();
      });
    });

    it('should resolve if no deploy', () => {
      awsDeploy.options.noDeploy = true;

      const errorMock = {
        message: 'does not exist',
      };

      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.reject(errorMock));

      const writeCreateTemplateToDiskStub = sinon
        .stub(awsDeploy, 'writeCreateTemplateToDisk').returns(BbPromise.resolve());
      const createStub = sinon
        .stub(awsDeploy, 'create').returns(BbPromise.resolve());
      const monitorStub = sinon
        .stub(awsDeploy, 'monitorCreate').returns(BbPromise.resolve());
      const postCreateStub = sinon
        .stub(awsDeploy, 'postCreate').returns(BbPromise.resolve());

      return awsDeploy.createStack().then(() => {
        expect(writeCreateTemplateToDiskStub.calledOnce).to.be.equal(true);
        expect(createStub.called).to.be.equal(false);
        expect(monitorStub.called).to.be.equal(false);
        expect(postCreateStub.called).to.be.equal(false);

        awsDeploy.create.restore();
        awsDeploy.sdk.request.restore();
      });
    });

    it('should run promise chain in order', () => {
      const errorMock = {
        message: 'does not exist',
      };

      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.reject(errorMock));

      const createStub = sinon
        .stub(awsDeploy, 'create').returns(BbPromise.resolve());
      const monitorStub = sinon
        .stub(awsDeploy, 'monitorCreate').returns(BbPromise.resolve());
      const postCreateStub = sinon
        .stub(awsDeploy, 'postCreate').returns(BbPromise.resolve());

      return awsDeploy.createStack().then(() => {
        expect(createStub.calledOnce).to.be.equal(true);
        expect(monitorStub.calledAfter(createStub)).to.be.equal(true);
        expect(postCreateStub.calledAfter(monitorStub)).to.be.equal(true);

        awsDeploy.create.restore();
        awsDeploy.monitorCreate.restore();
        awsDeploy.postCreate.restore();
        awsDeploy.sdk.request.restore();
      });
    });
  });

  describe('#loadCoreCloudFormationTemplate', () => {
    it('should load the core CloudFormation template', () => {
      const template = awsDeploy.loadCoreCloudFormationTemplate();

      expect(template.Resources.ServerlessDeploymentBucket.Type)
        .to.equal('AWS::S3::Bucket');
    });
  });

  describe('#writeCreateTemplateToDisk', () => {
    it('should write the compiled CloudFormation template into the .serverless directory', () => {
      awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = { key: 'value' };

      const templatePath = path.join(tmpDirPath,
        '.serverless',
        'cloudformation-template-create-stack.json');

      return awsDeploy.writeCreateTemplateToDisk().then(() => {
        expect(serverless.utils.fileExistsSync(templatePath)).to.equal(true);
        expect(serverless.utils.readFileSync(templatePath)).to.deep.equal({ key: 'value' });
      });
    });
  });
});
