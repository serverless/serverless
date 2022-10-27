'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const overrideCwd = require('process-utils/override-cwd');
const overrideEnv = require('process-utils/override-env');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const { StepHistory } = require('@serverless/utils/telemetry');
const inquirer = require('@serverless/utils/inquirer');

const fixtures = require('../../../../fixtures/programmatic');

const { expect } = chai;

chai.use(require('chai-as-promised'));

describe('test/unit/lib/cli/interactive-setup/console-resolve-org.test.js', function () {
  this.timeout(1000 * 60 * 3);

  let step;
  let authMode = 'user';
  let mockOrgNames = [];

  before(() => {
    step = proxyquire('../../../../../lib/cli/interactive-setup/console-resolve-org', {
      '@serverless/utils/auth/resolve-mode': async () => authMode,
      '@serverless/utils/api-request': async (pathname) => {
        if (pathname === '/api/identity/me') return { userId: 'user' };
        if (pathname === '/api/identity/users/user/orgs') {
          return { orgs: mockOrgNames.map((orgName) => ({ orgName })) };
        }
        throw new Error(`Unexpected pathname "${pathname}"`);
      },
    });
  });

  after(() => {
    sinon.restore();
  });

  afterEach(async () => {
    mockOrgNames = [];
    authMode = 'user';
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

  it('Should be ineffective, when no orgs are resolved', async () => {
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
    expect(context.inapplicabilityReasonCode).to.equal('NO_ORGS_AVAILABLE');
  });

  describe('Monitoring setup', () => {
    it('Should recognize and skip, when single org is assigned to the account', async () => {
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
      mockOrgNames = ['testinteractivecli'];
      await overrideCwd(serviceDir, async () => {
        expect(await step.isApplicable(context)).to.be.false;
      });
      expect(context.inapplicabilityReasonCode).to.equal('ONLY_ORG');
      expect(context.org).to.deep.equal({ orgName: 'testinteractivecli' });
    });

    it('Should ask for org if passed in one is invalid', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: 'testinteractivecli' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-console-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { console: true, org: 'foo' },
        isConsole: true,
        initial: {},
        inquirer,
        stepHistory: new StepHistory(),
      };
      mockOrgNames = ['testinteractivecli'];
      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      expect(Array.from(context.stepHistory.valuesMap())).to.deep.equal(
        Array.from(new Map([['orgName', '_user_choice_']]))
      );
      expect(context.org).to.deep.equal({ orgName: 'testinteractivecli' });
    });

    it('Should setup monitoring for chosen org', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: 'testinteractivecli' },
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
        stepHistory: new StepHistory(),
      };

      mockOrgNames = ['testinteractivecli', 'someotherorg'];
      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['orgName', '_user_choice_']])
      );
      expect(context.org).to.deep.equal({ orgName: 'testinteractivecli' });
    });

    it('Should setup monitoring for org based on access key', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: 'fromaccesskey' },
      });
      const context = {
        options: { console: true },
        isConsole: true,
        initial: {},
        inquirer,
        stepHistory: new StepHistory(),
      };
      authMode = 'org';
      // TODO: Decide whether that test needs to stay
      mockOrgNames = ['fromaccesskey'];
      await overrideEnv({ variables: { SLS_ORG_TOKEN: 'token' } }, async () => {
        expect(await step.isApplicable(context)).to.be.false;
      });
      expect(context.inapplicabilityReasonCode).to.equal('ONLY_ORG');
      expect(context.org).to.deep.equal({ orgName: 'fromaccesskey' });
    });

    it('Should allow to skip setting monitoring when selecting org', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: '_skip_' },
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
        stepHistory: new StepHistory(),
      };
      mockOrgNames = ['testinteractivecli', 'someother'];
      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });

      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
      expect(context).to.not.have.property('org');
    });
  });
});
