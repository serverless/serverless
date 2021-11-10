'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const overrideCwd = require('process-utils/override-cwd');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const { StepHistory } = require('@serverless/utils/telemetry');
const inquirer = require('@serverless/utils/inquirer');

const { expect } = chai;

chai.use(require('chai-as-promised'));

const fixtures = require('../../../../fixtures/programmatic');

const ServerlessSDKMock = class ServerlessSDK {
  constructor() {
    this.metadata = {
      get: async () => {
        return {
          awsAccountId: '377024778620',
          supportedRuntimes: ['nodejs10.x', 'nodejs12.x', 'python2.7', 'python3.6', 'python3.7'],
          supportedRegions: [
            'us-east-1',
            'us-east-2',
            'us-west-2',
            'eu-central-1',
            'eu-west-1',
            'eu-west-2',
            'ap-northeast-1',
            'ap-southeast-1',
            'ap-southeast-2',
          ],
        };
      },
    };
  }
};

const step = proxyquire('../../../../../lib/cli/interactive-setup/dashboard-login', {
  '@serverless/platform-client': {
    ServerlessSDK: ServerlessSDKMock,
  },
});

describe('test/unit/lib/cli/interactive-setup/dashboard-login.test.js', function () {
  this.timeout(1000 * 60 * 3);

  const loginStub = sinon.stub().resolves();

  afterEach(() => {
    loginStub.resetHistory();
  });

  it('Should be ineffective, when not at service path', async () => {
    const context = {};
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('NOT_IN_SERVICE_DIRECTORY');
  });

  it('Should be ineffective, when not at AWS service path', async () => {
    const context = {
      serviceDir: process.cwd(),
      configuration: {},
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
    };
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('NON_AWS_PROVIDER');
  });

  it('Should be ineffective, when not at supported runtime service path', async () => {
    const context = {
      serviceDir: process.cwd(),
      configuration: { provider: { name: 'aws', runtime: 'java8' } },
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
    };
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('UNSUPPORTED_RUNTIME');
  });

  it('Should be ineffective, when logged in', async () => {
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-service'
    );
    const context = {
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
    };
    expect(await overrideCwd(serviceDir, async () => await step.isApplicable(context))).to.equal(
      false
    );
    expect(context.inapplicabilityReasonCode).to.equal('ALREADY_LOGGED_IN');
  });

  it('Should login when user decides to login/register', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldLoginOrRegister: true },
    });
    const loginStep = proxyquire('../../../../../lib/cli/interactive-setup/dashboard-login', {
      '@serverless/dashboard-plugin/lib/login': loginStub,
      '@serverless/platform-client': {
        ServerlessSDK: ServerlessSDKMock,
      },
    });
    const context = {
      serviceDir: process.cwd(),
      configuration: { provider: { name: 'aws', runtime: 'nodejs12.x' } },
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
      stepHistory: new StepHistory(),
    };
    await loginStep.run(context);
    expect(loginStub.calledOnce).to.be.true;
    expect(context.stepHistory.valuesMap()).to.deep.equal(
      new Map([['shouldLoginOrRegister', true]])
    );
  });

  it('Should not login when user decides not to login/register', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldLoginOrRegister: false },
    });
    const loginStep = proxyquire('../../../../../lib/cli/interactive-setup/dashboard-login', {
      '@serverless/dashboard-plugin/lib/login': loginStub,
      '@serverless/platform-client': {
        ServerlessSDK: ServerlessSDKMock,
      },
    });
    const context = {
      serviceDir: process.cwd(),
      configuration: { provider: { name: 'aws', runtime: 'nodejs12.x' } },
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
      stepHistory: new StepHistory(),
    };
    await loginStep.run(context);
    expect(loginStub.called).to.be.false;
    expect(context.stepHistory.valuesMap()).to.deep.equal(
      new Map([['shouldLoginOrRegister', false]])
    );
  });
});
