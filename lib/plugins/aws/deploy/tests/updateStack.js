'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const BbPromise = require('bluebird');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');

describe('updateStack', () => {
  let serverless;
  let awsDeploy;
  const tmpDirPath = testUtils.getTmpDirPath();

  beforeEach(() => {
    serverless = new Serverless();
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

  describe('#update()', () => {
    let updateStackStub;

    beforeEach(() => {
      updateStackStub = sinon
        .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());
    });

    it('should update the stack', () => awsDeploy.update()
      .then(() => {
        expect(updateStackStub.calledOnce).to.be.equal(true);
        expect(updateStackStub.args[0][0]).to.be.equal('CloudFormation');
        expect(updateStackStub.args[0][1]).to.be.equal('updateStack');
        expect(updateStackStub.args[0][2].StackName)
          .to.be.equal(`${awsDeploy.serverless.service.service}-${awsDeploy.options.stage}`);
        expect(updateStackStub.args[0][2].TemplateURL)
          .to.be.equal(`https://s3.amazonaws.com/${awsDeploy.bucketName}/${awsDeploy.serverless
          .service.package.artifactDirectoryName}/compiled-cloudformation-template.json`);
        expect(updateStackStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));

        awsDeploy.sdk.request.restore();
      })
    );
  });

  describe('#monitorUpdate()', () => {
    it('should keep monitoring until UPDATE_COMPLETE stack status', () => {
      const describeStacksStub = sinon.stub(awsDeploy.sdk, 'request');
      const cfDataMock = {
        StackId: 'new-service-dev',
      };
      const DescribeReturn = {
        Stacks: [
          {
            StackStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      };
      const finalDescribeReturn = {
        Stacks: [
          {
            StackStatus: 'UPDATE_COMPLETE',
          },
        ],
      };

      describeStacksStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

      return awsDeploy.monitorUpdate(cfDataMock, 10).then((stack) => {
        expect(describeStacksStub.callCount).to.be.equal(3);
        expect(describeStacksStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        expect(stack.StackStatus).to.be.equal('UPDATE_COMPLETE');
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
            StackStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      };
      const finalDescribeReturn = {
        Stacks: [
          {
            StackStatus: 'UNUSUAL_STATUS',
          },
        ],
      };

      describeStacksStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
      describeStacksStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

      return awsDeploy.monitorUpdate(cfDataMock, 10).catch((e) => {
        expect(e.name).to.be.equal('ServerlessError');
        expect(describeStacksStub.callCount).to.be.equal(3);
        expect(describeStacksStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.sdk.request.restore();
      });
    });
  });

  describe('#updateStack()', () => {
    it('should resolve if no deploy', () => {
      awsDeploy.options.noDeploy = true;

      const writeUpdateTemplateStub = sinon
        .stub(awsDeploy, 'writeUpdateTemplateToDisk').returns();
      const updateStub = sinon
        .stub(awsDeploy, 'update').returns(BbPromise.resolve());
      const monitorStub = sinon
        .stub(awsDeploy, 'monitorUpdate').returns(BbPromise.resolve());

      return awsDeploy.updateStack().then(() => {
        expect(writeUpdateTemplateStub.calledOnce).to.be.equal(true);
        expect(updateStub.called).to.be.equal(false);
        expect(monitorStub.called).to.be.equal(false);

        awsDeploy.update.restore();
        awsDeploy.monitorUpdate.restore();
      });
    });

    it('should run promise chain in order', () => {
      const updateStub = sinon
        .stub(awsDeploy, 'update').returns(BbPromise.resolve());
      const monitorStub = sinon
        .stub(awsDeploy, 'monitorUpdate').returns(BbPromise.resolve());

      return awsDeploy.updateStack().then(() => {
        expect(updateStub.calledOnce).to.be.equal(true);
        expect(monitorStub.calledAfter(updateStub)).to.be.equal(true);

        awsDeploy.update.restore();
        awsDeploy.monitorUpdate.restore();
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
