'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const os = require('os');
const path = require('path');
const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const AwsDeploy = require('../awsDeploy');
const Serverless = require('../../../Serverless');

const serverless = new Serverless();
serverless.init();
const awsDeploy = new AwsDeploy(serverless);
const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
const serverlessEnvYamlPath = path.join(tmpDirPath, 'serverless.env.yaml');
const serverlessEnvYaml = {
  vars: {},
  stages: {
    dev: {
      vars: {},
      regions: {
        aws_useast1: {
          vars: {},
        },
      },
    },
  },
};
serverless.service.service = `service-${(new Date).getTime().toString()}`;
serverless.config.servicePath = tmpDirPath;
serverless.utils.writeFileSync(serverlessEnvYamlPath, serverlessEnvYaml);
awsDeploy.options = {
  stage: 'dev',
  region: 'us-east-1',
};
awsDeploy.CloudFormation = new AWS.CloudFormation({ region: 'us-east-1' });
BbPromise.promisifyAll(awsDeploy.CloudFormation, { suffix: 'Promised' });

describe('#create()', () => {
  it('should create stack', () => {
    const createStackStub = sinon
      .stub(awsDeploy.CloudFormation, 'createStackPromised').returns(BbPromise.resolve());
    return awsDeploy.create().then(() => {
      expect(createStackStub.calledOnce).to.be.equal(true);
      awsDeploy.CloudFormation.createStackPromised.restore();
    });
  });
});

describe('#monitorCreate()', () => {
  it('should keep monitoring until CREATE_COMPLETE stack status', () => {
    const describeStub = sinon.stub(awsDeploy.CloudFormation, 'describeStacksPromised');
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
    const finalDescribeReturn = {
      Stacks: [
        {
          StackStatus: 'CREATE_COMPLETE',
        },
      ],
    };

    describeStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
    describeStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
    describeStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

    return awsDeploy.monitorCreate(cfDataMock, 10).then((stack) => {
      expect(describeStub.callCount).to.be.equal(3);
      expect(stack.StackStatus).to.be.equal('CREATE_COMPLETE');
      awsDeploy.CloudFormation.describeStacksPromised.restore();
    });
  });

  it('should throw an error if CloudFormation returned unusual stack status', () => {
    const describeStub = sinon.stub(awsDeploy.CloudFormation, 'describeStacksPromised');
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
    const finalDescribeReturn = {
      Stacks: [
        {
          StackStatus: 'UNUSUAL_STATUS',
        },
      ],
    };

    describeStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
    describeStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
    describeStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

    return awsDeploy.monitorCreate(cfDataMock, 10).catch((e) => {
      expect(e.name).to.be.equal('ServerlessError');
      expect(describeStub.callCount).to.be.equal(3);
      awsDeploy.CloudFormation.describeStacksPromised.restore();
    });
  });
});

describe('#addOutputVars()', () => {
  it('should addOutputVariables to memory and serverless.env.yaml', () => {
    const cfDataMock = {
      Outputs: [
        {
          OutputKey: 'IamRoleArnLambda',
          OutputValue: 'someValue',
        },
      ],
    };
    awsDeploy.serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {
            aws_useast1: {
              vars: {},
            },
          },
        },
      },
    };
    return awsDeploy.addOutputVars(cfDataMock)
      .then(() => awsDeploy.serverless.yamlParser.parse(serverlessEnvYamlPath))
      .then((yaml) => {
        // assert var added to memory
        expect(awsDeploy.serverless.service.environment.stages.dev
          .regions.aws_useast1.vars.iamRoleArnLambda).to.be.equal('someValue');

        // assert var added to file
        expect(yaml.stages.dev
          .regions.aws_useast1.vars.iamRoleArnLambda).to.be.equal('someValue');
      });
  });
});

describe('#createStack()', () => {
  it('should resolve if stack already created', () => {
    const createStub = sinon
      .stub(awsDeploy, 'create').returns(BbPromise.resolve());
    awsDeploy.serverless.service.environment.stages.dev
      .regions.aws_useast1.vars.iamRoleArnLambda = true;

    return awsDeploy.createStack().then(() => {
      awsDeploy.serverless.service.environment.stages.dev
        .regions.aws_useast1.vars.iamRoleArnLambda = false;
      expect(createStub.called).to.be.equal(false);
      awsDeploy.create.restore();
    });
  });

  it('should run promise chain in order', () => {
    const createStub = sinon
      .stub(awsDeploy, 'create').returns(BbPromise.resolve());
    const monitorStub = sinon
      .stub(awsDeploy, 'monitorCreate').returns(BbPromise.resolve());
    const addOutputvarsStub = sinon
      .stub(awsDeploy, 'addOutputVars').returns(BbPromise.resolve());

    return awsDeploy.createStack().then(() => {
      expect(createStub.calledOnce).to.be.equal(true);
      expect(monitorStub.calledAfter(createStub)).to.be.equal(true);
      expect(addOutputvarsStub.calledAfter(monitorStub)).to.be.equal(true);

      awsDeploy.create.restore();
      awsDeploy.monitorCreate.restore();
      awsDeploy.addOutputVars.restore();
    });
  });
});