'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const wait = require('timers-ext/promise/sleep');
const overrideCwd = require('process-utils/override-cwd');
const inquirer = require('@serverless/utils/inquirer');
const { StepHistory } = require('@serverless/utils/telemetry');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');

const fixtures = require('../../../../fixtures/programmatic');

const { expect } = chai;

chai.use(require('chai-as-promised'));

describe('test/unit/lib/cli/interactive-setup/console-setup-iam-role.test.js', function () {
  this.timeout(1000 * 60 * 3);

  let step;
  let authMode = 'user';
  let mockOrgNames = [];
  let isIntegrated = false;
  let stackCreationOutcome = 'success';
  let stackAlreadyExists = false;

  before(() => {
    step = proxyquire('../../../../../lib/cli/interactive-setup/console-setup-iam-role', {
      '@serverless/utils/auth/resolve-mode': async () => authMode,
      '@serverless/utils/api-request': async (pathname) => {
        if (pathname === '/api/identity/me') return { userId: 'user' };
        if (pathname === '/api/identity/users/user/orgs') {
          return { orgs: mockOrgNames.map((orgName) => ({ orgName })) };
        }
        if (pathname === '/api/integrations/?orgId=integrated') {
          return {
            integrations: [{ vendorAccount: '12345', status: 'alive', syncStatus: 'running' }],
          };
        }
        if (pathname === '/api/integrations/?orgId=tobeintegrated') {
          return {
            integrations: isIntegrated
              ? [{ vendorAccount: '12345', status: 'alive', syncStatus: 'running' }]
              : [],
          };
        }
        if (pathname.startsWith('/api/integrations/aws/initial?orgId=')) {
          return { cfnTemplateUrl: 'someUrl', params: {} };
        }

        throw new Error(`Unexpected pathname "${pathname}"`);
      },
      './utils': {
        awsRequest: async (ingore, serviceConfig, method) => {
          switch (method) {
            case 'createStack':
              return {};

            case 'describeStacks':
              if (stackAlreadyExists) return {};
              throw Object.assign(new Error('Stack with id test does not exist'), {
                Code: 'ValidationError',
              });
            case 'describeStackEvents':
              switch (stackCreationOutcome) {
                case 'success':
                  return {
                    StackEvents: [
                      {
                        EventId: 'fdc5ed10-4a41-11ed-b15b-12151bc3f4d1',
                        StackName: 'test',
                        LogicalResourceId: 'test',
                        ResourceType: 'AWS::CloudFormation::Stack',
                        ResourceStatus: 'CREATE_COMPLETE',
                      },
                    ],
                  };
                case 'failure':
                  return {
                    StackEvents: [
                      {
                        EventId: 'fdc5ed10-4a41-11ed-b15b-12151bc3f4d1',
                        StackName: 'test',
                        LogicalResourceId: 'test',
                        ResourceType: 'AWS::Lambda::Function',
                        ResourceStatus: 'CREATE_FAILED',
                        ResourceStatusReason: 'Cannot create due to some reason',
                      },
                    ],
                  };
                default:
                  throw new Error(`Unexpexted stack creation outcome: ${stackCreationOutcome}`);
              }
            default:
              throw new Error(`Unexpexted AWS method: ${method}`);
          }
        },
      },
    });
  });

  after(() => {
    sinon.restore();
  });

  afterEach(async () => {
    mockOrgNames = [];
    authMode = 'user';
    stackCreationOutcome = 'success';
    isIntegrated = false;
    stackAlreadyExists = false;
    sinon.reset();
  });

  it('Should be ineffective, when --console not passed', async () => {
    const context = {
      initial: {},
      options: {},
    };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('NON_CONSOLE_CONTEXT');
  });

  it('Should be ineffective, when not logged in', async () => {
    const context = {
      options: { console: true },
      isConsole: true,
      initial: {},
      inquirer,
    };
    authMode = null;
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('NOT_LOGGED_IN');
  });

  it('Should be ineffective, when no org is resolved', async () => {
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-service'
    );
    const context = {
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: { console: true },
      isConsole: true,
      initial: {},
      inquirer,
    };
    await overrideCwd(serviceDir, async () => {
      expect(await step.isApplicable(context)).to.be.false;
    });
    expect(context.inapplicabilityReasonCode).to.equal('UNRESOLVED_ORG');
  });

  it('Should be ineffective, when logged in account is already integrated', async () => {
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-service'
    );
    const context = {
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: { console: true },
      isConsole: true,
      initial: {},
      inquirer,
      org: { orgId: 'integrated' },
      awsAccountId: '12345',
    };
    await overrideCwd(serviceDir, async () => {
      expect(await step.isApplicable(context)).to.be.false;
    });
    expect(context.inapplicabilityReasonCode).to.equal('INTEGRATED');
  });

  it('Should be ineffective, when CF stack of given name is already deployed', async () => {
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-service'
    );
    const context = {
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: { console: true },
      isConsole: true,
      initial: {},
      inquirer,
      org: { orgId: 'tobeintegrated' },
      awsAccountId: '12345',
    };
    stackAlreadyExists = true;
    await overrideCwd(serviceDir, async () => {
      expect(await step.isApplicable(context)).to.be.false;
    });
    expect(context.inapplicabilityReasonCode).to.equal('AWS_ACCOUNT_ALREADY_INTEGRATED');
  });

  it('Should setup integration', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupConsoleIamRole: true },
    });
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-service'
    );
    const context = {
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: { console: true },
      isConsole: true,
      initial: {},
      inquirer,
      org: { orgId: 'tobeintegrated' },
      awsAccountId: '12345',
      stepHistory: new StepHistory(),
    };
    await overrideCwd(serviceDir, async () => {
      const stepData = await step.isApplicable(context);
      if (!stepData) throw new Error('Step resolved as not applicable');
      const deferredRun = step.run(context, stepData);
      await wait(1000);
      isIntegrated = true;
      expect(await deferredRun).to.be.true;
    });
  });

  it('Should abort gently if CF deployment fails', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupConsoleIamRole: true },
    });
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-service'
    );
    const context = {
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: { console: true },
      isConsole: true,
      initial: {},
      inquirer,
      org: { orgId: 'tobeintegrated' },
      awsAccountId: '12345',
      stepHistory: new StepHistory(),
    };
    await overrideCwd(serviceDir, async () => {
      const stepData = await step.isApplicable(context);
      if (!stepData) throw new Error('Step resolved as not applicable');
      stackCreationOutcome = 'failure';
      expect(await step.run(context, stepData)).to.be.false;
    });
  });
});
