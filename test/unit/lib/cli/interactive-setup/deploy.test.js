'use strict';

const chai = require('chai');
const chalk = require('chalk');
const sinon = require('sinon');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const overrideEnv = require('process-utils/override-env');
const step = require('../../../../../lib/cli/interactive-setup/deploy');
const proxyquire = require('proxyquire');
const overrideStdoutWrite = require('process-utils/override-stdout-write');

const { expect } = chai;

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const inquirer = require('@serverless/utils/inquirer');

describe('test/unit/lib/cli/interactive-setup/deploy.test.js', () => {
  it('Should be not applied, when not at service path', () =>
    expect(step.isApplicable({ options: {} })).to.equal(false));

  it('Should be not applied, when service was not setup during interactive flow', () =>
    expect(step.isApplicable({ serviceDir: '/foo', options: {}, history: new Map() })).to.equal(
      false
    ));

  it('Should be not applied, when service is not configured with AWS provider', () =>
    expect(
      step.isApplicable({
        configuration: { provider: { name: 'notaws' } },
        serviceDir: '/foo',
        options: {},
        history: new Map([['service', []]]),
      })
    ).to.equal(false));

  it('Should be applied, if awsCredentials step was not executed which means user already had credentials', () =>
    expect(
      step.isApplicable({
        configuration: { provider: { name: 'aws' } },
        serviceDir: '/foo',
        options: {},
        history: new Map([['service', []]]),
      })
    ).to.equal(true));

  it('Should be applied, if awsCredentials step was executed and user configured local credentials', () => {
    overrideEnv(
      { variables: { AWS_ACCESS_KEY_ID: 'somekey', AWS_SECRET_ACCESS_KEY: 'somesecret' } },
      () => {
        expect(
          step.isApplicable({
            configuration: { provider: { name: 'aws' } },
            serviceDir: '/foo',
            options: {},
            history: new Map([
              ['service', []],
              ['awsCredentials', []],
            ]),
          })
        ).to.equal(true);
      }
    );
  });

  it('Should be applied, if awsCredentials step was executed and user created a new provider', () =>
    expect(
      step.isApplicable({
        configuration: { provider: { name: 'aws' } },
        serviceDir: '/foo',
        options: {},
        history: new Map([
          ['service', []],
          [
            'awsCredentials',
            [
              {
                type: 'event',
                name: 'providerCreated',
              },
            ],
          ],
        ]),
      })
    ).to.equal(true));

  it('Should be applied, if awsCredentials step was executed and user created a new provider', () =>
    expect(
      step.isApplicable({
        configuration: { provider: { name: 'aws' } },
        serviceDir: '/foo',
        options: {},
        history: new Map([
          ['service', []],
          [
            'awsCredentials',
            [
              {
                type: 'event',
                name: 'existingProviderLinked',
              },
            ],
          ],
        ]),
      })
    ).to.equal(true));

  it('Should not be applied, if awsCredentials step was executed but user did not setup credentials', () =>
    expect(
      step.isApplicable({
        configuration: { provider: { name: 'aws' } },
        serviceDir: '/foo',
        options: {},
        history: new Map([
          ['service', []],
          ['awsCredentials', []],
        ]),
      })
    ).to.equal(false));

  describe('run', () => {
    it('should correctly handle skipping deployment for service configured with dashboard', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: false },
      });

      let stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        async () =>
          await step.run({
            serviceDir: process.cwd(),
            configuration: {
              service: 'someservice',
              provider: { name: 'aws' },
            },
            configurationFilename: 'serverless.yml',
          })
      );

      expect(stdoutData).to.include('Your project is ready for deployment');
      expect(stdoutData).to.include(`Run ${chalk.bold('serverless')} in the project directory`);
    });

    it('should correctly handle skipping deployment for service not configured with dashboard', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldDeploy: false },
      });

      let stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        async () =>
          await step.run({
            serviceDir: process.cwd(),
            configuration: {
              service: 'someservice',
              provider: { name: 'aws' },
              org: 'someorg',
              app: 'someapp',
            },
            configurationFilename: 'serverless.yml',
          })
      );

      expect(stdoutData).to.include('Your project is ready for deployment');
      expect(stdoutData).to.include('Invoke your functions and view logs in the dashboard');
    });

    it('should correctly handle deployment for service configured with dashboard', async () => {
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

      let stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        async () =>
          await mockedStep.run({
            serviceDir: process.cwd(),
            configuration: {
              service: 'someservice',
              provider: { name: 'aws' },
              org: 'someorg',
              app: 'someapp',
            },
            configurationFilename: 'serverless.yml',
          })
      );

      expect(stdoutData).to.include('Your project is live and available');
      expect(stdoutData).to.include(
        `Open ${chalk.bold('https://app.serverless-dev.com/path/to/dashboard')}`
      );
    });

    it('should correctly handle deployment for service not configured with dashboard', async () => {
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

      let stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        async () =>
          await mockedStep.run({
            serviceDir: process.cwd(),
            configuration: {
              service: 'someservice',
              provider: { name: 'aws' },
            },
            configurationFilename: 'serverless.yml',
          })
      );

      expect(stdoutData).to.include('Your project is live and available');
      expect(stdoutData).to.include(`Run ${chalk.bold('serverless')}`);
    });
  });
});
