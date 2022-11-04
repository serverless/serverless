'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const overrideCwd = require('process-utils/override-cwd');
const requireUncached = require('ncjsm/require-uncached');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const { StepHistory } = require('@serverless/utils/telemetry');
const inquirer = require('@serverless/utils/inquirer');

const { expect } = chai;

chai.use(require('chai-as-promised'));

const fixtures = require('../../../../fixtures/programmatic');

const step = require('../../../../../lib/cli/interactive-setup/console-login');

describe('test/unit/lib/cli/interactive-setup/console-login.test.js', function () {
  this.timeout(1000 * 60 * 3);

  const loginStub = sinon.stub().resolves();

  afterEach(() => {
    loginStub.resetHistory();
  });

  it('Should be ineffective, when not in console context', async () => {
    const context = { isConsole: false };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('NON_CONSOLE_CONTEXT');
  });

  it('Should be ineffective, when logged in', async () => {
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-service'
    );
    const context = {
      isConsole: true,
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: { console: true },
      initial: {},
      inquirer,
    };
    expect(
      await overrideCwd(serviceDir, async () =>
        requireUncached(async () =>
          require('../../../../../lib/cli/interactive-setup/console-login').isApplicable(context)
        )
      )
    ).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('ALREADY_LOGGED_IN');
  });

  it('Should login when user decides to login/register', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldLoginOrRegister: true },
    });
    const loginStep = proxyquire('../../../../../lib/cli/interactive-setup/console-login', {
      '../../../lib/commands/login/console': loginStub,
    });
    const context = {
      serviceDir: process.cwd(),
      configuration: { provider: { name: 'aws', runtime: 'nodejs14.x' } },
      configurationFilename: 'serverless.yml',
      options: { console: true },
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

  it('Should login and skip question when user providers `org` option', async () => {
    const loginStep = proxyquire('../../../../../lib/cli/interactive-setup/console-login', {
      '../../../lib/commands/login/console': loginStub,
    });
    const context = {
      serviceDir: process.cwd(),
      configuration: { provider: { name: 'aws', runtime: 'nodejs14.x' } },
      configurationFilename: 'serverless.yml',
      options: { org: 'someorg', console: true },
      initial: {},
      inquirer,
      stepHistory: new StepHistory(),
    };
    await loginStep.run(context);
    expect(loginStub.calledOnce).to.be.true;
  });

  it('Should login and skip question when `org` configured', async () => {
    const loginStep = proxyquire('../../../../../lib/cli/interactive-setup/console-login', {
      '../../../lib/commands/login/console': loginStub,
    });
    const context = {
      serviceDir: process.cwd(),
      configuration: { org: 'someorg', provider: { name: 'aws', runtime: 'nodejs14.x' } },
      configurationFilename: 'serverless.yml',
      options: { console: true },
      initial: {},
      inquirer,
      stepHistory: new StepHistory(),
    };
    await loginStep.run(context);
    expect(loginStub.calledOnce).to.be.true;
  });

  it('Should not login when user decides not to login/register', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldLoginOrRegister: false },
    });
    const loginStep = proxyquire('../../../../../lib/cli/interactive-setup/console-login', {
      '../../../lib/commands/login/console': loginStub,
    });
    const context = {
      serviceDir: process.cwd(),
      configuration: { provider: { name: 'aws', runtime: 'nodejs12.x' } },
      configurationFilename: 'serverless.yml',
      options: { console: true },
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
