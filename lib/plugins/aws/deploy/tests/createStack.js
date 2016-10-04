'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const BbPromise = require('bluebird');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');

describe('createStack', () => {
  let awsDeploy;
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
    const serverless = new Serverless();
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

      awsDeploy.serverless.service.provider
        .compiledCloudFormationTemplate = coreCloudFormationTemplate;

      const createStackStub = sinon
        .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      return awsDeploy.create().then(() => {
        expect(createStackStub.args[0][0]).to.equal('CloudFormation');
        expect(createStackStub.args[0][1]).to.equal('createStack');
        expect(createStackStub.args[0][2].StackName)
          .to.equal(`${awsDeploy.serverless.service.service}-${awsDeploy.options.stage}`);
        expect(JSON.parse(createStackStub.args[0][2].TemplateBody))
          .to.deep.equal(coreCloudFormationTemplate);
        expect(createStackStub.args[0][2].Tags)
          .to.deep.equal([{ Key: 'STAGE', Value: awsDeploy.options.stage }]);
        expect(createStackStub.calledOnce).to.be.equal(true);
        expect(createStackStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
      });
    });
  });

  describe('#createStack()', () => {
    it('should store the core CloudFormation template in the provider object', () => {
      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      const coreCloudFormationTemplate = awsDeploy.serverless.utils.readFileSync(
        path.join(__dirname,
          '..',
          'lib',
          'core-cloudformation-template.json')
      );

      awsDeploy.serverless.service.provider
        .compiledCloudFormationTemplate = coreCloudFormationTemplate;

      const writeCreateTemplateToDiskStub = sinon
        .stub(awsDeploy, 'writeCreateTemplateToDisk').returns(BbPromise.resolve());

      return awsDeploy.createStack().then(() => {
        expect(writeCreateTemplateToDiskStub.calledOnce).to.be.equal(true);
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate)
          .to.deep.equal(coreCloudFormationTemplate);
      });
    });

    it('should resolve if stack already created', () => {
      const createStub = sinon
        .stub(awsDeploy, 'create').returns(BbPromise.resolve());

      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      return awsDeploy.createStack().then(() => {
        expect(createStub.called).to.be.equal(false);
      });
    });

    it('should resolve if the noDeploy option is used', () => {
      awsDeploy.options.noDeploy = true;

      const writeCreateTemplateToDiskStub = sinon
        .stub(awsDeploy, 'writeCreateTemplateToDisk').returns(BbPromise.resolve());
      const createStub = sinon
        .stub(awsDeploy, 'create').returns(BbPromise.resolve());

      return awsDeploy.createStack().then(() => {
        expect(writeCreateTemplateToDiskStub.calledOnce).to.be.equal(true);
        expect(createStub.called).to.be.equal(false);
      });
    });

    it('should write the template to disk even if we do not specify the noDeploy option', () => {
      awsDeploy.options.noDeploy = false;

      const writeCreateTemplateToDiskStub = sinon
        .stub(awsDeploy, 'writeCreateTemplateToDisk').returns(BbPromise.resolve());
      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      return awsDeploy.createStack().then((res) => {
        expect(writeCreateTemplateToDiskStub.calledOnce).to.be.equal(true);
        expect(awsDeploy.sdk.request.called).to.be.equal(true);
        expect(res).to.equal('alreadyCreated');
      });
    });

    it('should throw error if describeStackResources fails for other reason than not found', () => {
      const errorMock = {
        message: 'Something went wrong.',
      };

      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.reject(errorMock));

      const createStub = sinon
        .stub(awsDeploy, 'create').returns(BbPromise.resolve());

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

      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.reject(errorMock));

      const createStub = sinon
        .stub(awsDeploy, 'create').returns(BbPromise.resolve());

      return awsDeploy.createStack().then(() => {
        expect(createStub.calledOnce).to.be.equal(true);
      });
    });
  });

  describe('#writeCreateTemplateToDisk', () => {
    it('should write the compiled CloudFormation template into the .serverless directory', () => {
      awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = { key: 'value' };

      const templatePath = path.join(tmpDirPath,
        '.serverless',
        'cloudformation-template-create-stack.json');

      return awsDeploy.writeCreateTemplateToDisk().then(() => {
        expect(awsDeploy.serverless.utils.fileExistsSync(templatePath)).to.equal(true);
        expect(awsDeploy.serverless.utils.readFileSync(templatePath)).to.deep.equal(
          { key: 'value' }
        );
      });
    });
  });
});
