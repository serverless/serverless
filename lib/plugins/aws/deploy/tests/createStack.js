'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const os = require('os');
const path = require('path');
const BbPromise = require('bluebird');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('createStack', () => {
  let serverless;
  let awsDeploy;

  const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
  const serverlessEnvYml = {
    vars: {},
    stages: {
      dev: {
        vars: {},
        regions: {
          'us-east-1': {
            vars: {},
          },
        },
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    serverless.utils.writeFileSync(serverlessYmlPath, serverlessYml);
    serverless.utils.writeFileSync(serverlessEnvYmlPath, serverlessEnvYml);
    serverless.config.servicePath = tmpDirPath;
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.serverless.service.service = `service-${(new Date).getTime().toString()}`;
    awsDeploy.serverless.cli = new serverless.classes.CLI();
    awsDeploy.serverless.service.resources = { Resources: {} };
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
    it('should resolve', (done) => awsDeploy
      .postCreate().then(() => done())
    );
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

    it('should merge custom provider resources into the core CloudFormation template', () => {
      // make sure that the promise will resolve
      sinon.stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      const customResourcesMock = {
        fakeResource1: {
          foo: 'bar',
        },
        fakeResource2: {
          baz: 'qux',
        },
      };

      awsDeploy.serverless.service.resources.Resources = customResourcesMock;

      return awsDeploy.createStack().then(() => {
        // make sure that the core CloudFormation template is used to merge stuff into it
        expect(awsDeploy.serverless.service.resources.Resources
          .ServerlessDeploymentBucket.Type).to.equal('AWS::S3::Bucket');

        // check if the custom provider resources are used
        expect(awsDeploy.serverless.service.resources.Resources.fakeResource1)
          .to.deep.equal(customResourcesMock.fakeResource1);
        expect(awsDeploy.serverless.service.resources.Resources.fakeResource2)
          .to.deep.equal(customResourcesMock.fakeResource2);

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
});
