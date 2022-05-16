'use strict';

const chai = require('chai');
const { join } = require('path');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const fsp = require('fs').promises;
const yaml = require('js-yaml');
const log = require('@serverless/utils/log').log.get('test');
const overrideCwd = require('process-utils/override-cwd');
const overrideEnv = require('process-utils/override-env');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const { StepHistory } = require('@serverless/utils/telemetry');
const inquirer = require('@serverless/utils/inquirer');

const fixtures = require('../../../../fixtures/programmatic');

const { expect } = chai;

chai.use(require('chai-as-promised'));

describe('test/unit/lib/cli/interactive-setup/console-set-org.test.js', function () {
  this.timeout(1000 * 60 * 3);

  let step;
  let authMode = 'user';
  let mockOrgNames = [];

  before(() => {
    step = proxyquire('../../../../../lib/cli/interactive-setup/console-set-org', {
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

  it('Should be ineffective, when not at service path', async () => {
    const context = {
      initial: {},
    };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('NOT_IN_SERVICE_DIRECTORY');
  });

  it('Should be ineffective, when not logged in', async () => {
    const context = {
      serviceDir: process.cwd(),
      configuration: {
        service: 'some-aws-service',
        provider: { name: 'aws', runtime: 'nodejs12.x' },
      },
      configurationFilename: 'serverless.yml',
      options: { console: true },
      isConsole: true,
      initial: {},
      inquirer,
    };
    authMode = null;
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('NOT_LOGGED_IN');
  });

  it('Should be ineffective, when not at AWS service path', async () => {
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-service',
      { configExt: { provider: 'azure' } }
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
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('NON_AWS_PROVIDER');
  });

  it('Should be ineffective, when not at supported runtime service path', async () => {
    const context = {
      serviceDir: process.cwd(),
      configuration: { service: 'some-aws-service', provider: { name: 'aws', runtime: 'java8' } },
      configurationFilename: 'serverless.yml',
      options: { console: true },
      isConsole: true,
      initial: {},
      inquirer,
    };
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('UNSUPPORTED_RUNTIME');
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

  it('Should be ineffective, when project has monitoring setup with recognized org', async () => {
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-monitored-service'
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
    expect(await overrideCwd(serviceDir, async () => await step.isApplicable(context))).to.equal(
      false
    );
    expect(context.inapplicabilityReasonCode).to.equal('HAS_MONITORING_SETUP');
  });

  it('Should recognize "console.org"', async () => {
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-monitored-service',
      { configExt: { org: 'foo', console: { org: 'testinteractivecli' } } }
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
    expect(await overrideCwd(serviceDir, async () => await step.isApplicable(context))).to.equal(
      false
    );
    expect(context.inapplicabilityReasonCode).to.equal('HAS_MONITORING_SETUP');
  });

  it('Should recognize an invalid org and allow to opt out', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldUpdateOrg: false },
    });
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-console-wrongorg-service'
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
    mockOrgNames = ['testinteractivecli'];
    await overrideCwd(serviceDir, async () => {
      const stepData = await step.isApplicable(context);
      if (!stepData) throw new Error('Step resolved as not applicable');
      await step.run(context, stepData);
    });
    expect(context.configuration).to.not.have.property('org');
    expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldUpdateOrg', false]]));
  });

  describe('Monitoring setup', () => {
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

      mockOrgNames = ['testinteractivecli'];
      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.equal('testinteractivecli');
      expect(serviceConfig.console).to.be.true;
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.console).to.be.true;
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['orgName', '_user_choice_']])
      );
    });

    it('Should setup monitoring for chosen app and org based on access key', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: 'fromaccesskey' },
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
      // TODO: Decide whether that test needs to stay
      mockOrgNames = ['fromaccesskey'];
      await overrideEnv({ variables: { SLS_ORG_TOKEN: 'token' } }, async () => {
        await overrideCwd(serviceDir, async () => {
          const stepData = await step.isApplicable(context);
          if (!stepData) throw new Error('Step resolved as not applicable');
          await step.run(context, stepData);
        });
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.equal('fromaccesskey');
      expect(serviceConfig.console).to.be.true;
      expect(context.configuration.org).to.equal('fromaccesskey');
      expect(context.configuration.console).to.be.true;
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['orgName', '_user_choice_']])
      );
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
      mockOrgNames = ['testinteractivecli'];
      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig).to.not.have.property('org');
      expect(serviceConfig).to.not.have.property('console');
      expect(context.configuration).to.not.have.property('org');
      expect(context.configuration).to.not.have.property('console');
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
    });
  });

  describe('Monitoring setup when only one org available', () => {
    beforeEach(() => {
      mockOrgNames = ['autofilledorg'];
    });

    it('Should not automatically pre choose single available org if login/register step was not presented', async () => {
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
      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig).to.not.have.property('org');
      expect(serviceConfig).to.not.have.property('console');
      expect(context.configuration).to.not.have.property('org');
      expect(context.configuration).to.not.have.property('console');
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
    });

    it('Should not automatically pre choose single available org if context history is not available', async () => {
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
      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig).to.not.have.property('org');
      expect(serviceConfig).to.not.have.property('console');
      expect(context.configuration).to.not.have.property('org');
      expect(context.configuration).to.not.have.property('console');
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
    });

    it('Should not automatically pre choose single available org if login/register step was presented but service step was not', async () => {
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
        history: new Map([['consoleLogin', []]]),
        stepHistory: new StepHistory(),
      };
      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig).to.not.have.property('org');
      expect(serviceConfig).to.not.have.property('console');
      expect(context.configuration).to.not.have.property('org');
      expect(context.configuration).to.not.have.property('console');
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
    });

    it('Should setup monitoring with the only available org if login/register and service steps were presented', async () => {
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
        history: new Map([
          ['consoleLogin', []],
          ['service', []],
        ]),
        stepHistory: new StepHistory(),
      };

      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.equal('autofilledorg');
      expect(serviceConfig.console).to.be.true;
      expect(context.configuration.org).to.equal('autofilledorg');
      expect(context.configuration.console).to.be.true;
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map());
    });
  });

  describe('Monitoring setup from CLI flags', () => {
    beforeEach(() => {
      mockOrgNames = ['testinteractivecli', 'otherorg'];
    });
    it('Should setup monitoring for chosen org and console', async () => {
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'testinteractivecli', console: true },
        isConsole: true,
        initial: {},
        inquirer,
        history: new Map(),
        stepHistory: new StepHistory(),
      };

      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.equal('testinteractivecli');
      expect(serviceConfig.console).to.be.true;
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.console).to.be.true;
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map());
    });

    it('Should setup monitoring even if already configured', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldOverrideConsoleConfig: true },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-console-monitored-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'otherorg', console: true },
        isConsole: true,
        initial: {},
        inquirer,
        history: new Map(),
        stepHistory: new StepHistory(),
      };

      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.equal('otherorg');
      expect(serviceConfig.console).to.be.true;
      expect(context.configuration.org).to.equal('otherorg');
      expect(context.configuration.console).to.be.true;
      expect(Array.from(context.stepHistory.valuesMap())).to.deep.equal(
        Array.from(new Map([['shouldOverrideConsoleConfig', true]]))
      );
    });

    it('Should ensure console remains enabled if already configured', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldOverrideConsoleConfig: true },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-monitored-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { console: true },
        isConsole: true,
        initial: {},
        inquirer,
        history: new Map(),
        stepHistory: new StepHistory(),
      };

      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) {
          throw new Error(`Step resolved as not applicable: ${context.inapplicabilityReasonCode}`);
        }
        log.debug('step data: %o', stepData);
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.equal('testinteractivecli');
      expect(serviceConfig.app).to.equal('some-aws-service-app');
      expect(serviceConfig.console).to.be.true;
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('some-aws-service-app');
      expect(context.configuration.console).to.be.true;
      expect(Array.from(context.stepHistory.valuesMap())).to.deep.equal(Array.from(new Map()));
    });

    it('Should ask for org if passed in one is invalid', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: 'testinteractivecli', appName: 'other-app' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-console-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'invalid-testinteractivecli', console: true },
        isConsole: true,
        initial: {},
        inquirer,
        history: new Map(),
        stepHistory: new StepHistory(),
      };

      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.equal('testinteractivecli');
      expect(serviceConfig.console).to.be.true;
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.console).to.be.true;

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['orgName', '_user_choice_']])
      );
    });

    it('Should ask for org if passed in one is invalid and there is a valid one in config', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldOverrideConsoleConfig: true },
        list: { orgName: 'otherorg', appName: 'other-app' },
      });

      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-console-monitored-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'invalid-testinteractivecli', console: true },
        isConsole: true,
        initial: {},
        inquirer,
        history: new Map(),
        stepHistory: new StepHistory(),
      };

      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.equal('otherorg');
      expect(serviceConfig.console).to.be.true;
      expect(context.configuration.org).to.equal('otherorg');
      expect(context.configuration.console).to.be.true;

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['orgName', '_user_choice_'],
          ['shouldOverrideConsoleConfig', true],
        ])
      );
    });
  });

  describe('Monitoring setup when invalid org', () => {
    it('Should provide a way to setup monitoring with an invalid org setting', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldUpdateOrg: true },
        list: { orgName: 'testinteractivecli' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-console-wrongorg-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        inquirer,
        options: { console: true },
        isConsole: true,
        initial: {},
        history: new Map(),
        stepHistory: new StepHistory(),
      };
      mockOrgNames = ['testinteractivecli', 'otherorg'];
      await overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.equal('testinteractivecli');
      expect(serviceConfig.console).to.be.true;
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.console).to.be.true;
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['shouldUpdateOrg', true],
          ['orgName', '_user_choice_'],
        ])
      );
    });
  });
});
