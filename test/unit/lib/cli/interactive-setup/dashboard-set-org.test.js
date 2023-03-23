'use strict';

const chai = require('chai');
const { join } = require('path');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const fsp = require('fs').promises;
const yaml = require('js-yaml');
const overrideCwd = require('process-utils/override-cwd');
const overrideEnv = require('process-utils/override-env');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const { StepHistory } = require('@serverless/utils/telemetry');
const inquirer = require('@serverless/utils/inquirer');

const fixtures = require('../../../../fixtures/programmatic');

const { expect } = chai;

chai.use(require('chai-as-promised'));

describe('test/unit/lib/cli/interactive-setup/dashboard-set-org.test.js', function () {
  this.timeout(1000 * 60 * 3);

  let step;
  let mockOrganizationsList = [
    { tenantName: 'testinteractivecli' },
    { tenantName: 'otherorg' },
    { tenantName: 'orgwithoutapps' },
  ];

  before(async () => {
    const ServerlessSDKMock = class ServerlessSDK {
      constructor() {
        this.metadata = {
          get: async () => {
            return {
              awsAccountId: '377024778620',
              supportedRuntimes: [
                'nodejs10.x',
                'nodejs12.x',
                'python2.7',
                'python3.6',
                'python3.7',
              ],
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

        this.apps = {
          create: async ({ app: { name } }) => ({ appName: name }),
          list: async ({ orgName }) => {
            if (orgName === 'orgwithoutapps') {
              return [];
            }

            return [
              { appName: 'some-aws-service-app' },
              { appName: 'other-app' },
              { appName: 'app-from-flag' },
            ];
          },
        };

        this.organizations = {
          list: async () => {
            return mockOrganizationsList;
          },
        };

        this.accessKeys = {
          get: async () => {
            return {
              orgName: 'fromaccesskey',
            };
          },
        };
      }

      async refreshToken() {
        return {};
      }

      config() {}
    };

    step = proxyquire('../../../../../lib/cli/interactive-setup/dashboard-set-org', {
      '@serverless/platform-client': {
        ServerlessSDK: ServerlessSDKMock,
      },
      '@serverless/dashboard-plugin/lib/client-utils': {
        getPlatformClientWithAccessKey: async () => new ServerlessSDKMock(),
        getOrCreateAccessKeyForOrg: async () => 'accessKey',
      },
    });
  });

  after(() => {
    sinon.restore();
  });

  afterEach(async () => {
    sinon.reset();
  });

  it('Should be ineffective, when not at service path', async () => {
    const context = {
      initial: {},
    };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('NOT_IN_SERVICE_DIRECTORY');
  });

  it('Should be ineffective, when in console context', async () => {
    const context = {
      initial: {},
      serviceDir: process.cwd(),
      configuration: {},
      configurationFilename: 'serverless.yml',
      options: { console: true },
      isConsole: true,
    };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('CONSOLE_CONTEXT');
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
      configuration: { service: 'some-aws-service', provider: { name: 'aws', runtime: 'java8' } },
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
    };
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('UNSUPPORTED_RUNTIME');
  });

  it('Should be ineffective, when not logged in', async () => {
    const context = {
      serviceDir: process.cwd(),
      configuration: {
        service: 'some-aws-service',
        provider: { name: 'aws', runtime: 'nodejs12.x' },
      },
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
    };
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('NOT_LOGGED_IN');
  });

  it('Should be ineffective, when no orgs are resolved', async () => {
    const freshStep = proxyquire('../../../../../lib/cli/interactive-setup/dashboard-set-org', {
      '@serverless/platform-client': {
        ServerlessSDK: class ServerlessSDK {
          constructor() {
            this.metadata = {
              get: async () => {
                return {
                  awsAccountId: '377024778620',
                  supportedRuntimes: ['nodejs10.x', 'nodejs12.x'],
                  supportedRegions: ['us-east-1'],
                };
              },
            };
            this.organizations = {
              list: async () => [],
            };
          }

          config() {}
        },
      },
    });
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
    await overrideCwd(serviceDir, async () => {
      expect(await freshStep.isApplicable(context)).to.be.false;
    });
    expect(context.inapplicabilityReasonCode).to.equal('NO_ORGS_AVAILABLE');
  });

  it('Should be ineffective, when project has monitoring setup with recognized org and app', async () => {
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-monitored-service'
    );
    const context = {
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
    };
    await overrideCwd(serviceDir, async () => {
      expect(await step.isApplicable(context)).to.be.false;
    });
    expect(await overrideCwd(serviceDir, async () => await step.isApplicable(context))).to.equal(
      false
    );
    expect(context.inapplicabilityReasonCode).to.equal('HAS_MONITORING_SETUP');
  });

  it('Should reject an invalid app name', async () => {
    configureInquirerStub(inquirer, {
      input: { newAppName: 'invalid app name /* Ć */' },
      list: { orgName: 'testinteractivecli', appName: '_create_' },
    });
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
      stepHistory: new StepHistory(),
    };
    await expect(
      overrideCwd(serviceDir, async () => {
        const stepData = await step.isApplicable(context);
        if (!stepData) throw new Error('Step resolved as not applicable');
        await step.run(context, stepData);
      })
    ).to.eventually.be.rejected.and.have.property('code', 'INVALID_ANSWER');
    expect(context.stepHistory.valuesMap()).to.deep.equal(
      new Map([
        ['orgName', '_user_choice_'],
        ['appName', '_create_'],
        ['newAppName', undefined],
      ])
    );
  });

  it('Should recognize an invalid org and allow to opt out', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldUpdateOrg: false },
    });
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-wrongorg-service'
    );
    const context = {
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
      stepHistory: new StepHistory(),
    };
    await overrideCwd(serviceDir, async () => {
      const stepData = await step.isApplicable(context);
      if (!stepData) throw new Error('Step resolved as not applicable');
      await step.run(context, stepData);
    });
    expect(context.configuration).to.not.have.property('org');
    expect(context.configuration).to.not.have.property('app');
    expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldUpdateOrg', false]]));
  });

  it('Should recognize an invalid app and allow to opt out', async () => {
    configureInquirerStub(inquirer, {
      list: { appUpdateType: '_skip_' },
    });
    const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
      'aws-loggedin-wrongapp-service'
    );
    const context = {
      serviceDir,
      configuration,
      configurationFilename: 'serverless.yml',
      options: {},
      initial: {},
      inquirer,
      stepHistory: new StepHistory(),
    };
    await overrideCwd(serviceDir, async () => {
      const stepData = await step.isApplicable(context);
      if (!stepData) throw new Error('Step resolved as not applicable');
      await step.run(context, stepData);
    });
    expect(context.configuration.org).to.equal('testinteractivecli');
    expect(context.configuration.app).to.equal('not-created-app');
    expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['appUpdateType', '_skip_']]));
  });

  describe('Monitoring setup', () => {
    it('Should setup monitoring for chosen org and app', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: 'testinteractivecli', appName: 'other-app' },
      });
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('other-app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['orgName', '_user_choice_'],
          ['appName', '_user_choice_'],
        ])
      );
    });

    it('Should setup monitoring for chosen app and org based on access key', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: 'fromaccesskey', appName: 'other-app' },
      });
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
        stepHistory: new StepHistory(),
      };
      await overrideEnv({ variables: { SERVERLESS_ACCESS_KEY: 'validkey' } }, async () => {
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('fromaccesskey');
      expect(context.configuration.app).to.equal('other-app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['orgName', '_user_choice_'],
          ['appName', '_user_choice_'],
        ])
      );
    });

    it('Should allow to skip monitoring when org is resolved from access key', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: '_skip_' },
      });
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
        stepHistory: new StepHistory(),
      };
      await overrideEnv({ variables: { SERVERLESS_ACCESS_KEY: 'validkey' } }, async () => {
        await overrideCwd(serviceDir, async () => {
          const stepData = await step.isApplicable(context);
          if (!stepData) throw new Error('Step resolved as not applicable');
          await step.run(context, stepData);
        });
      });
      const serviceConfig = yaml.load(
        String(await fsp.readFile(join(serviceDir, 'serverless.yml')))
      );
      expect(serviceConfig.org).to.be.undefined;
      expect(serviceConfig.app).to.be.undefined;
      expect(context.configuration.org).to.be.undefined;
      expect(context.configuration.app).to.be.undefined;
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
    });

    it('Should allow to skip setting monitoring when selecting org', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: '_skip_' },
      });
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
      expect(serviceConfig.org).to.be.undefined;
      expect(serviceConfig.app).to.be.undefined;
      expect(context.configuration.org).to.be.undefined;
      expect(context.configuration.app).to.be.undefined;
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
    });
  });

  describe('Monitoring setup when only one org available', () => {
    before(() => {
      mockOrganizationsList = [{ tenantName: 'orgwithoutapps' }];
    });

    after(() => {
      mockOrganizationsList = [
        { tenantName: 'testinteractivecli' },
        { tenantName: 'otherorg' },
        { tenantName: 'orgwithoutapps' },
      ];
    });

    it('Should not automatically pre choose single available org if login/register step was not presented', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: '_skip_' },
      });
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
      expect(serviceConfig.org).to.be.undefined;
      expect(serviceConfig.app).to.be.undefined;
      expect(context.configuration.org).to.be.undefined;
      expect(context.configuration.app).to.be.undefined;
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
    });

    it('Should not automatically pre choose single available org if context history is not available', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: '_skip_' },
      });
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
      expect(serviceConfig.org).to.be.undefined;
      expect(serviceConfig.app).to.be.undefined;
      expect(context.configuration.org).to.be.undefined;
      expect(context.configuration.app).to.be.undefined;
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
    });

    it('Should not automatically pre choose single available org if login/register step was presented but service step was not', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: '_skip_' },
      });
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
        history: new Map([['dashboardLogin', []]]),
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
      expect(serviceConfig.org).to.be.undefined;
      expect(serviceConfig.app).to.be.undefined;
      expect(context.configuration.org).to.be.undefined;
      expect(context.configuration.app).to.be.undefined;
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['orgName', '_skip_']]));
    });

    it('Should setup monitoring with the only available org if login/register and service steps were presented', async () => {
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
        history: new Map([
          ['dashboardLogin', []],
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
      expect(serviceConfig.org).to.equal('orgwithoutapps');
      expect(serviceConfig.app).to.equal(configuration.service);
      expect(context.configuration.org).to.equal('orgwithoutapps');
      expect(context.configuration.app).to.equal(configuration.service);
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map());
    });
  });

  describe('Monitoring setup from CLI flags', () => {
    it('Should setup monitoring for chosen org and app', async () => {
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'testinteractivecli', app: 'other-app' },
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('other-app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map());
    });

    it('Should setup monitoring for chosen org and app even if already configured', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldOverrideDashboardConfig: true },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-monitored-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'otherorg', app: 'app-from-flag' },
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
      expect(serviceConfig.app).to.equal('app-from-flag');
      expect(context.configuration.org).to.equal('otherorg');
      expect(context.configuration.app).to.equal('app-from-flag');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['shouldOverrideDashboardConfig', true]])
      );
    });

    it('Should not setup monitoring for chosen org and app even if already configured if rejected', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldOverrideDashboardConfig: false },
      });

      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-monitored-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'otherorg', app: 'app-from-flag' },
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
      expect(context.configuration).to.not.have.property('org');
      expect(context.configuration).to.not.have.property('app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['shouldOverrideDashboardConfig', false]])
      );
    });

    it('Should ask for org if passed in one is invalid', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: 'testinteractivecli', appName: 'other-app' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'invalid-testinteractivecli', app: 'irrelevant' },
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('other-app');

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['orgName', '_user_choice_'],
          ['appName', '_user_choice_'],
        ])
      );
    });

    it('Should ask for org if passed in one is invalid and there is a valid on in config', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldOverrideDashboardConfig: true },
        list: { orgName: 'otherorg', appName: 'other-app' },
      });

      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-monitored-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'invalid-testinteractivecli', app: 'irrelevant' },
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('otherorg');
      expect(context.configuration.app).to.equal('other-app');

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['orgName', '_user_choice_'],
          ['appName', '_user_choice_'],
          ['shouldOverrideDashboardConfig', true],
        ])
      );
    });

    it('Should ask for app if passed in one is invalid and there is a valid on in config', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldOverrideDashboardConfig: true },
        list: { orgName: 'testinteractivecli', appName: 'other-app' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-monitored-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'invalid-testinteractivecli', app: 'irrelevant' },
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('other-app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['orgName', '_user_choice_'],
          ['appName', '_user_choice_'],
          ['shouldOverrideDashboardConfig', true],
        ])
      );
    });

    it('Should ask for app if passed in one is invalid', async () => {
      configureInquirerStub(inquirer, {
        list: { orgName: 'testinteractivecli', appName: 'other-app' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        options: { org: 'testinteractivecli', app: 'invalid' },
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('other-app');

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['appName', '_user_choice_']])
      );
    });

    it('Should create new app when requested, and setup monitoring with it', async () => {
      configureInquirerStub(inquirer, {
        input: { newAppName: 'frominput' },
        list: { orgName: 'testinteractivecli', appName: '_create_' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        inquirer,
        options: {},
        initial: {},
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
      expect(serviceConfig.app).to.equal('frominput');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('frominput');

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['orgName', '_user_choice_'],
          ['appName', '_create_'],
          ['newAppName', '_user_input_'],
        ])
      );
    });
  });

  describe('Monitoring setup when invalid org', () => {
    it('Should provide a way to setup monitoring with an invalid org setting', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldUpdateOrg: true },
        list: { orgName: 'testinteractivecli', appName: 'other-app' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-wrongorg-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        inquirer,
        options: {},
        initial: {},
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('other-app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['shouldUpdateOrg', true],
          ['orgName', '_user_choice_'],
          ['appName', '_user_choice_'],
        ])
      );
    });
  });

  describe('Monitoring setup when no app', () => {
    it('Should allow to setup app', async () => {
      configureInquirerStub(inquirer, {
        list: { appName: 'other-app' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-noapp-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        inquirer,
        options: {},
        initial: {},
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('other-app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['appName', '_user_choice_']])
      );
    });
  });

  describe('Monitoring setup when no app with --app flag', () => {
    it('Should allow to setup app', async () => {
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-noapp-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        inquirer,
        options: { app: 'app-from-flag' },
        initial: {},
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
      expect(serviceConfig.app).to.equal('app-from-flag');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('app-from-flag');
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map());
    });

    it('Should create a default app if no apps exist', async () => {
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-noapp-service',
        { configExt: { org: 'orgwithoutapps' } }
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        inquirer,
        options: {},
        initial: {},
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
      expect(serviceConfig.org).to.equal('orgwithoutapps');
      expect(serviceConfig.app).to.equal(configuration.service);
      expect(context.configuration.org).to.equal('orgwithoutapps');
      expect(context.configuration.app).to.equal(configuration.service);
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map());
    });

    it('Should allow to setup app when app is invalid', async () => {
      configureInquirerStub(inquirer, {
        list: { appName: 'other-app' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-noapp-service'
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        inquirer,
        options: { app: 'invalid-app-from-flag' },
        initial: {},
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('other-app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['appName', '_user_choice_']])
      );
    });
  });

  describe('Monitoring setup when invalid app', () => {
    it('Should recognize an invalid app and allow to create it', async () => {
      configureInquirerStub(inquirer, {
        list: { appUpdateType: '_create_' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-service',
        {
          configExt: {
            org: 'testinteractivecli',
            app: 'not-created-app',
          },
        }
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        inquirer,
        options: {},
        initial: {},
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
      expect(serviceConfig.app).to.equal('not-created-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('not-created-app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['appUpdateType', '_create_']])
      );
    });

    it('Should recognize an invalid app and allow to replace it with existing one', async () => {
      configureInquirerStub(inquirer, {
        list: { appUpdateType: '_choose_existing_', appName: 'other-app' },
      });
      const { servicePath: serviceDir, serviceConfig: configuration } = await fixtures.setup(
        'aws-loggedin-service',
        {
          configExt: {
            org: 'testinteractivecli',
            app: 'not-created-app',
          },
        }
      );
      const context = {
        serviceDir,
        configuration,
        configurationFilename: 'serverless.yml',
        inquirer,
        options: {},
        initial: {},
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
      expect(serviceConfig.app).to.equal('other-app');
      expect(context.configuration.org).to.equal('testinteractivecli');
      expect(context.configuration.app).to.equal('other-app');
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['appUpdateType', '_choose_existing_'],
          ['appName', '_user_choice_'],
        ])
      );
    });
  });
});
