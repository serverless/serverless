'use strict';

const chai = require('chai');
const sinon = require('sinon');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const overrideEnv = require('process-utils/override-env');
const step = require('../../../../../lib/cli/interactive-setup/deploy');
const proxyquire = require('proxyquire');
const { StepHistory } = require('@serverless/utils/telemetry');

const { expect } = chai;

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const inquirer = require('@serverless/utils/inquirer');

describe('test/unit/lib/cli/interactive-setup/deploy.test.js', () => {
  it('Should be not applied, when not at service path', async () => {
    const context = {
      options: {},
    };
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('NOT_IN_SERVICE_DIRECTORY');
  });

  it('Should be not applied, when service is not configured with AWS provider', async () => {
    const context = {
      configuration: { provider: { name: 'notaws' } },
      serviceDir: '/foo',
      options: {},
      history: new Map([['service', []]]),
    };
    expect(await step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('NON_AWS_PROVIDER');
  });

  it('Should be applied if user configured local credentials', async () => {
    await overrideEnv(
      { variables: { AWS_ACCESS_KEY_ID: 'somekey', AWS_SECRET_ACCESS_KEY: 'somesecret' } },
      async () => {
        expect(
          await step.isApplicable({
            configuration: { provider: { name: 'aws' } },
            serviceDir: '/foo',
            options: {},
            history: new Map([['awsCredentials', []]]),
          })
        ).to.equal(true);
      }
    );
  });

  it('Should be applied if service instance has a linked provider', async () => {
    const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/deploy', {
      '@serverless/dashboard-plugin/lib/isAuthenticated': () => true,
      './utils': {
        doesServiceInstanceHaveLinkedProvider: () => true,
      },
    });

    expect(
      await mockedStep.isApplicable({
        configuration: { provider: { name: 'aws' }, org: 'someorg' },
        serviceDir: '/foo',
        options: {},
        history: new Map([['awsCredentials', []]]),
      })
    ).to.equal(true);
  });

  describe('run', () => {
    it('should correctly handle skipping deployment for new service not configured with dashboard', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: false },
      });

      const context = {
        serviceDir: process.cwd(),
        configuration: {
          service: 'someservice',
          provider: { name: 'aws' },
        },
        configurationFilename: 'serverless.yml',
        stepHistory: new StepHistory(),
        initial: {
          isInServiceContext: false,
        },
      };
      await step.run(context);

      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldDeploy', false]]));
    });

    it('should correctly handle skipping deployment for existing service not configured with dashboard', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: false },
      });

      const context = {
        serviceDir: process.cwd(),
        configuration: {
          service: 'someservice',
          provider: { name: 'aws' },
        },
        configurationFilename: 'serverless.yml',
        stepHistory: new StepHistory(),
        initial: {
          isInServiceContext: true,
        },
      };
      await step.run(context);

      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldDeploy', false]]));
    });

    it('should correctly handle skipping deployment for new service configured with dashboard', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: false },
      });

      const context = {
        serviceDir: process.cwd(),
        configuration: {
          service: 'someservice',
          provider: { name: 'aws' },
          org: 'someorg',
          app: 'someapp',
        },
        configurationFilename: 'serverless.yml',
        stepHistory: new StepHistory(),
        initial: {
          isInServiceContext: false,
        },
      };
      await step.run(context);

      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldDeploy', false]]));
    });

    it('should correctly handle skipping deployment for existing service configured with dashboard', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: false },
      });

      const context = {
        serviceDir: process.cwd(),
        configuration: {
          service: 'someservice',
          provider: { name: 'aws' },
          org: 'someorg',
          app: 'someapp',
        },
        configurationFilename: 'serverless.yml',
        stepHistory: new StepHistory(),
        initial: {
          isInServiceContext: true,
        },
      };
      await step.run(context);

      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldDeploy', false]]));
    });

    it('should correctly handle deployment for new service configured with dashboard', async () => {
      const mockedInit = sinon.stub().resolves();
      const mockedRun = sinon.stub().resolves();
      class MockedServerless {
        constructor() {
          this.init = mockedInit;
          this.run = mockedRun;
          this.pluginManager = {
            addPlugin: () => ({}),
            plugins: [
              {
                constructor: {
                  name: 'InteractiveDeployProgress',
                },
                progress: {},
              },
            ],
            dashboardPlugin: {},
          };
        }
      }

      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/deploy', {
        '../../Serverless': MockedServerless,
        '@serverless/dashboard-plugin/lib/dashboard': {
          getDashboardInteractUrl: () => 'https://app.serverless-dev.com/path/to/dashboard',
        },
      });

      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: true },
      });

      const context = {
        serviceDir: process.cwd(),
        configuration: {
          service: 'someservice',
          provider: { name: 'aws' },
          org: 'someorg',
          app: 'someapp',
        },
        configurationFilename: 'serverless.yml',
        stepHistory: new StepHistory(),
        initial: {
          isInServiceContext: false,
        },
      };
      await mockedStep.run(context);

      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldDeploy', true]]));
    });

    it('should correctly handle deployment for existing service configured with dashboard', async () => {
      const mockedInit = sinon.stub().resolves();
      const mockedRun = sinon.stub().resolves();
      class MockedServerless {
        constructor() {
          this.init = mockedInit;
          this.run = mockedRun;
          this.pluginManager = {
            addPlugin: () => ({}),
            plugins: [
              {
                constructor: {
                  name: 'InteractiveDeployProgress',
                },
                progress: {},
              },
            ],
            dashboardPlugin: {},
          };
        }
      }

      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/deploy', {
        '../../Serverless': MockedServerless,
        '@serverless/dashboard-plugin/lib/dashboard': {
          getDashboardInteractUrl: () => 'https://app.serverless-dev.com/path/to/dashboard',
        },
      });

      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: true },
      });

      const context = {
        serviceDir: process.cwd(),
        configuration: {
          service: 'someservice',
          provider: { name: 'aws' },
          org: 'someorg',
          app: 'someapp',
        },
        configurationFilename: 'serverless.yml',
        stepHistory: new StepHistory(),
        initial: {
          isInServiceContext: true,
        },
      };
      await mockedStep.run(context);

      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldDeploy', true]]));
    });

    it('should correctly handle deployment for new service not configured with dashboard', async () => {
      const mockedInit = sinon.stub().resolves();
      const mockedRun = sinon.stub().resolves();
      class MockedServerless {
        constructor() {
          this.init = mockedInit;
          this.run = mockedRun;
          this.pluginManager = {
            addPlugin: () => ({}),
            plugins: [
              {
                constructor: {
                  name: 'InteractiveDeployProgress',
                },
                progress: {},
              },
            ],
          };
        }
      }

      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/deploy', {
        '../../Serverless': MockedServerless,
      });

      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: true },
      });

      const context = {
        serviceDir: process.cwd(),
        configuration: {
          service: 'someservice',
          provider: { name: 'aws' },
        },
        configurationFilename: 'serverless.yml',
        stepHistory: new StepHistory(),
        initial: {
          isInServiceContext: false,
        },
      };
      await mockedStep.run(context);

      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldDeploy', true]]));
    });

    it('should correctly handle deployment for existing service not configured with dashboard', async () => {
      const mockedInit = sinon.stub().resolves();
      const mockedRun = sinon.stub().resolves();
      class MockedServerless {
        constructor() {
          this.init = mockedInit;
          this.run = mockedRun;
          this.pluginManager = {
            addPlugin: () => ({}),
            plugins: [
              {
                constructor: {
                  name: 'InteractiveDeployProgress',
                },
                progress: {},
              },
            ],
          };
        }
      }

      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/deploy', {
        '../../Serverless': MockedServerless,
      });

      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: true },
      });

      const context = {
        serviceDir: process.cwd(),
        configuration: {
          service: 'someservice',
          provider: { name: 'aws' },
        },
        configurationFilename: 'serverless.yml',
        stepHistory: new StepHistory(),
        initial: {
          isInServiceContext: true,
        },
      };
      await mockedStep.run(context);

      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['shouldDeploy', true]]));
    });
  });
});
