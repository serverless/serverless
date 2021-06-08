'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const overrideEnv = require('process-utils/override-env');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const requireUncached = require('ncjsm/require-uncached');
const chalk = require('chalk');

const { expect } = chai;

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const { join, resolve } = require('path');
const { remove: rmDir, outputFile: writeFile } = require('fs-extra');
const { resolveFileProfiles } = require('../../../../../lib/plugins/aws/utils/credentials');

const mockedSdk = {
  organizations: {
    get: () => {
      return {
        orgUid: 'org-uid',
      };
    },
  },
  getProviders: async () => {
    return { result: [] };
  },
};

const step = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
  '../../utils/openBrowser': async (url) => {
    openBrowserUrls.push(url);
  },
  '@serverless/dashboard-plugin/lib/clientUtils': {
    getPlatformClientWithAccessKey: async () => mockedSdk,
  },
});

const inquirer = require('@serverless/utils/inquirer');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');

const openBrowserUrls = [];

describe('test/unit/lib/cli/interactive-setup/aws-credentials.test.js', () => {
  const accessKeyId = 'AKIAIOSFODNN7EXAMPLE';
  const secretAccessKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

  afterEach(() => {
    openBrowserUrls.length = 0;
    sinon.restore();
  });

  it('Should be ineffective, when not at service path', async () =>
    expect(await step.isApplicable({})).to.equal(false));

  it('Should be ineffective, when not at AWS service', async () =>
    expect(
      await step.isApplicable({
        serviceDir: process.cwd(),
        configuration: {},
        configurationFilename: 'serverless.yml',
      })
    ).to.equal(false));

  it('Should be ineffective, when user has default provider set', async () => {
    const internalMockedSdk = {
      ...mockedSdk,
      getProviders: async () => {
        return {
          result: [
            {
              alias: 'someprovider',
              providerName: 'aws',
              providerType: 'roleArn',
              providerUid: 'provideruid',
              isDefault: true,
              providerDetails: {
                roleArn: 'arn:xxx',
              },
            },
          ],
        };
      },
    };
    const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
      '@serverless/dashboard-plugin/lib/clientUtils': {
        getPlatformClientWithAccessKey: async () => internalMockedSdk,
      },
      '@serverless/utils/config': {
        getLoggedInUser: () => {
          return {
            accessKeys: {
              someorg: 'xxx',
            },
          };
        },
      },
    });

    expect(
      await mockedStep.isApplicable({
        serviceDir: process.cwd(),
        configuration: { provider: { name: 'aws' }, org: 'someorg' },
        configurationFilename: 'serverless.yml',
      })
    ).to.be.false;
  });

  it('Should be ineffective, when existing service already has a provider set', async () => {
    const internalMockedSdk = {
      ...mockedSdk,
      getProviders: async () => {
        return {
          result: [
            {
              alias: 'someprovider',
              providerName: 'aws',
              providerType: 'roleArn',
              providerUid: 'provideruid',
              isDefault: false,
              providerDetails: {
                roleArn: 'arn:xxx',
              },
            },
          ],
        };
      },
    };
    const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
      '@serverless/dashboard-plugin/lib/clientUtils': {
        getPlatformClientWithAccessKey: async () => internalMockedSdk,
      },
      '@serverless/utils/config': {
        getLoggedInUser: () => {
          return {
            accessKeys: {
              someorg: 'xxx',
            },
          };
        },
      },
      '@serverless/dashboard-plugin/lib/resolveProviderCredentials': () => {
        return {
          accessKeyId: 'somekey',
          secretAccessKey: 'somesecret',
          sessionToken: 'somesessiontoken',
        };
      },
    });

    expect(
      await mockedStep.isApplicable({
        history: new Set(),
        serviceDir: process.cwd(),
        configuration: {
          provider: { name: 'aws' },
          org: 'someorg',
          app: 'someapp',
          service: 'service',
        },
        options: {},
        configurationFilename: 'serverless.yml',
      })
    ).to.be.false;
  });

  it('Should be effective, when existing service instance does not have a provider set', async () => {
    const internalMockedSdk = {
      ...mockedSdk,
      getProviders: async () => {
        return {
          result: [
            {
              alias: 'someprovider',
              providerName: 'aws',
              providerType: 'roleArn',
              providerUid: 'provideruid',
              isDefault: false,
              providerDetails: {
                roleArn: 'arn:xxx',
              },
            },
          ],
        };
      },
    };
    const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
      '@serverless/dashboard-plugin/lib/clientUtils': {
        getPlatformClientWithAccessKey: async () => internalMockedSdk,
      },
      '@serverless/utils/config': {
        getLoggedInUser: () => {
          return {
            accessKeys: {
              someorg: 'xxx',
            },
          };
        },
      },
      '@serverless/dashboard-plugin/lib/resolveProviderCredentials': () => {
        return null;
      },
    });

    expect(
      await mockedStep.isApplicable({
        history: new Set(),
        serviceDir: process.cwd(),
        configuration: {
          provider: { name: 'aws' },
          org: 'someorg',
          app: 'someapp',
          service: 'service',
        },
        options: {},
        configurationFilename: 'serverless.yml',
      })
    ).to.be.true;
  });

  it('Should emit warning when dashboard is not available when fetching providers', async () => {
    const internalMockedSdk = {
      ...mockedSdk,
      getProviders: async () => {
        const err = new Error('unavailable');
        err.statusCode = 500;
        throw err;
      },
    };
    const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
      '@serverless/dashboard-plugin/lib/clientUtils': {
        getPlatformClientWithAccessKey: async () => internalMockedSdk,
      },
      '@serverless/utils/config': {
        getLoggedInUser: () => {
          return {
            accessKeys: {
              someorg: 'xxx',
            },
          };
        },
      },
    });

    let stdoutData = '';
    await overrideStdoutWrite(
      (data) => (stdoutData += data),
      async () =>
        expect(
          await mockedStep.isApplicable({
            serviceDir: process.cwd(),
            configuration: { provider: { name: 'aws' }, org: 'someorg' },
            configurationFilename: 'serverless.yml',
          })
        ).to.be.false
    );

    expect(stdoutData).to.include('Dashboard service is currently unavailable');
  });

  it('Should be effective, at AWS service and no credentials are set', async () =>
    expect(
      await step.isApplicable({
        serviceDir: process.cwd(),
        configuration: { provider: { name: 'aws' } },
        configurationFilename: 'serverless.yml',
      })
    ).to.equal(true));

  it('Should emit a message when user decides to skip credentials setup', async () => {
    configureInquirerStub(inquirer, {
      list: { credentialsSetupChoice: '_skip_' },
    });

    let stdoutData = '';
    await overrideStdoutWrite(
      (data) => (stdoutData += data),
      async () =>
        await step.run({
          serviceDir: process.cwd(),
          configuration: { provider: { name: 'aws' }, org: 'someorg' },
          configurationFilename: 'serverless.yml',
        })
    );

    expect(stdoutData).to.include('You can setup your AWS account later');
  });

  describe('In environment credentials', () => {
    let restoreEnv;
    let uncachedStep;

    before(() => {
      ({ restoreEnv } = overrideEnv({ asCopy: true }));
      process.env.AWS_ACCESS_KEY_ID = accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
      uncachedStep = requireUncached(() =>
        require('../../../../../lib/cli/interactive-setup/aws-credentials')
      );
    });

    after(() => restoreEnv);

    it('Should be ineffective, when credentials are set in environment', async () => {
      expect(
        await uncachedStep.isApplicable({
          serviceDir: process.cwd(),
          configuration: { provider: { name: 'aws' } },
          configurationFilename: 'serverless.yml',
        })
      ).to.equal(false);
    });
  });

  describe('AWS config handling', () => {
    let credentialsDirPath;
    let credentialsFilePath;

    before(() => {
      credentialsDirPath = resolve('.aws');
      credentialsFilePath = join(credentialsDirPath, 'credentials');
    });

    afterEach(() => rmDir(credentialsDirPath));

    describe('Existing credentials case', () => {
      before(() =>
        writeFile(
          credentialsFilePath,
          [
            '[some-profile]',
            `aws_access_key_id = ${accessKeyId}`,
            `aws_secret_access_key = ${secretAccessKey}`,
          ].join('\n')
        )
      );

      it('Should be ineffective, When credentials are set in AWS config', async () =>
        expect(
          await step.isApplicable({
            serviceDir: process.cwd(),
            configuration: { provider: { name: 'aws' } },
            configurationFilename: 'serverless.yml',
          })
        ).to.equal(false));
    });

    it('Should setup credentials for users not having an AWS account', async () => {
      configureInquirerStub(inquirer, {
        list: { credentialsSetupChoice: '_local_' },
        confirm: { hasAwsAccount: false },
        input: {
          createAwsAccountPrompt: '',
          generateAwsCredsPrompt: '',
          accessKeyId,
          secretAccessKey,
        },
      });
      await step.run({ configuration: { provider: {} }, options: {} });
      expect(openBrowserUrls.length).to.equal(2);
      expect(openBrowserUrls[0].includes('signup')).to.be.true;
      expect(openBrowserUrls[1].includes('console.aws.amazon.com')).to.be.true;
      resolveFileProfiles().then((profiles) => {
        expect(profiles).to.deep.equal(new Map([['default', { accessKeyId, secretAccessKey }]]));
      });
    });

    it('Should setup credentials for users having an AWS account', async () => {
      configureInquirerStub(inquirer, {
        list: { credentialsSetupChoice: '_local_' },
        confirm: { hasAwsAccount: true },
        input: { generateAwsCredsPrompt: '', accessKeyId, secretAccessKey },
      });
      await step.run({ configuration: { provider: {} }, options: {} });
      expect(openBrowserUrls.length).to.equal(1);
      expect(openBrowserUrls[0].includes('console.aws.amazon.com')).to.be.true;
      return resolveFileProfiles().then((profiles) => {
        expect(profiles).to.deep.equal(new Map([['default', { accessKeyId, secretAccessKey }]]));
      });
    });

    it('Should not accept invalid access key id', async () => {
      configureInquirerStub(inquirer, {
        list: { credentialsSetupChoice: '_local_' },
        confirm: { hasAwsAccount: true },
        input: { generateAwsCredsPrompt: '', accessKeyId: 'foo', secretAccessKey },
      });
      await expect(
        step.run({
          configuration: { provider: {} },
          options: {},
        })
      ).to.eventually.be.rejected.and.have.property('code', 'INVALID_ANSWER');
    });

    it('Should not accept invalid secret access key', async () => {
      configureInquirerStub(inquirer, {
        list: { credentialsSetupChoice: '_local_' },
        confirm: { hasAwsAccount: true },
        input: { generateAwsCredsPrompt: '', accessKeyId, secretAccessKey: 'foo' },
      });
      await expect(
        step.run({
          configuration: { provider: {} },
          options: {},
        })
      ).to.eventually.be.rejected.and.have.property('code', 'INVALID_ANSWER');
    });
  });

  describe('Provider config handling', () => {
    it('Should correctly setup with newly created provider when no previous providers exist', async () => {
      const mockedOpenBrowser = sinon.stub().returns();
      const mockedDisconnect = sinon.stub().returns();
      const mockedCreateProviderLink = sinon.stub().resolves();
      const providerUid = 'provideruid';
      const internalMockedSdk = {
        ...mockedSdk,
        connect: ({ onEvent }) => {
          onEvent({
            data: {
              object: {
                provider_uid: providerUid,
              },
            },
          });
        },
        disconnect: mockedDisconnect,
        createProviderLink: mockedCreateProviderLink,
      };
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
        '@serverless/dashboard-plugin/lib/clientUtils': {
          getPlatformClientWithAccessKey: async () => internalMockedSdk,
        },
        '../../utils/openBrowser': mockedOpenBrowser,
        '@serverless/utils/config': {
          getLoggedInUser: () => ({}),
        },
      });

      configureInquirerStub(inquirer, {
        list: { credentialsSetupChoice: '_create_provider_' },
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
            options: {},
            configurationFilename: 'serverless.yml',
          })
      );

      expect(stdoutData).to.include('AWS Access Role provider was successfully created');
      expect(mockedOpenBrowser).to.have.been.calledWith(
        chalk.bold.white(
          'https://app.serverless.com/someorg/settings/providers?source=cli&providerId=new&provider=aws'
        )
      );
      expect(mockedDisconnect).to.have.been.called;
      expect(mockedCreateProviderLink).not.to.have.been.called;
    });

    it('Should correctly setup with newly created provider when previous providers exist', async () => {
      const mockedOpenBrowser = sinon.stub().returns();
      const mockedDisconnect = sinon.stub().returns();
      const mockedCreateProviderLink = sinon.stub().resolves();
      const providerUid = 'provideruid';
      const internalMockedSdk = {
        ...mockedSdk,
        connect: ({ onEvent }) => {
          onEvent({
            data: {
              object: {
                provider_uid: providerUid,
              },
            },
          });
        },
        getProviders: async () => {
          return {
            result: [
              {
                alias: 'someprovider',
                providerName: 'aws',
                providerType: 'roleArn',
                providerUid,
                providerDetails: {
                  roleArn: 'arn:xxx',
                },
              },
            ],
          };
        },
        disconnect: mockedDisconnect,
        createProviderLink: mockedCreateProviderLink,
      };
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
        '@serverless/dashboard-plugin/lib/clientUtils': {
          getPlatformClientWithAccessKey: async () => internalMockedSdk,
        },
        '../../utils/openBrowser': mockedOpenBrowser,
        '@serverless/utils/config': {
          getLoggedInUser: () => ({}),
        },
      });

      configureInquirerStub(inquirer, {
        list: { credentialsSetupChoice: '_create_provider_' },
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
            options: {},
            configurationFilename: 'serverless.yml',
          })
      );

      expect(stdoutData).to.include('AWS Access Role provider was successfully created');
      expect(mockedOpenBrowser).to.have.been.calledWith(
        chalk.bold.white(
          'https://app.serverless.com/someorg/settings/providers?source=cli&providerId=new&provider=aws'
        )
      );
      expect(mockedDisconnect).to.have.been.called;
      expect(mockedCreateProviderLink).to.have.been.calledWith(
        'org-uid',
        'instance',
        'appName|someapp|serviceName|someservice|stage|dev|region|us-east-1',
        providerUid
      );
    });

    it('Should emit warning when dashboard unavailable when connecting to it', async () => {
      const mockedOpenBrowser = sinon.stub().returns();
      const internalMockedSdk = {
        ...mockedSdk,
        connect: () => {
          const err = new Error('error');
          err.statusCode = 500;
          throw err;
        },
      };
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
        '@serverless/dashboard-plugin/lib/clientUtils': {
          getPlatformClientWithAccessKey: async () => internalMockedSdk,
        },
        '../../utils/openBrowser': mockedOpenBrowser,
      });

      configureInquirerStub(inquirer, {
        list: { credentialsSetupChoice: '_create_provider_' },
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

      expect(stdoutData).to.include('Dashboard service is currently unavailable');
      expect(mockedOpenBrowser).to.have.been.calledWith(
        chalk.bold.white(
          'https://app.serverless.com/someorg/settings/providers?source=cli&providerId=new&provider=aws'
        )
      );
    });

    it('Should correctly setup with existing provider', async () => {
      const providerUid = 'provideruid';
      const mockedCreateProviderLink = sinon.stub().resolves();
      const internalMockedSdk = {
        ...mockedSdk,
        getProviders: async () => {
          return {
            result: [
              {
                alias: 'someprovider',
                providerName: 'aws',
                providerType: 'accessKey',
                providerUid,
                providerDetails: {
                  accessKeyId: 'axx',
                },
              },
            ],
          };
        },
        createProviderLink: mockedCreateProviderLink,
      };
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
        '@serverless/dashboard-plugin/lib/clientUtils': {
          getPlatformClientWithAccessKey: async () => internalMockedSdk,
        },
      });

      configureInquirerStub(inquirer, {
        list: { credentialsSetupChoice: providerUid },
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
            options: {},
            configurationFilename: 'serverless.yml',
          })
      );

      expect(mockedCreateProviderLink).to.have.been.calledWith(
        'org-uid',
        'instance',
        'appName|someapp|serviceName|someservice|stage|dev|region|us-east-1',
        'provideruid'
      );
      expect(stdoutData).to.include('Selected provider was successfully linked');
    });

    it('Should emit a warning when dashboard is not available and link cannot be created', async () => {
      const providerUid = 'provideruid';
      const mockedCreateProviderLink = sinon.stub().callsFake(async () => {
        const err = new Error('error');
        err.statusCode = 500;
        throw err;
      });
      const internalMockedSdk = {
        ...mockedSdk,
        getProviders: async () => {
          return {
            result: [
              {
                alias: 'someprovider',
                providerName: 'aws',
                providerType: 'roleArn',
                providerUid,
                providerDetails: {
                  roleArn: 'arn:xxx',
                },
              },
            ],
          };
        },
        createProviderLink: mockedCreateProviderLink,
      };
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
        '@serverless/dashboard-plugin/lib/clientUtils': {
          getPlatformClientWithAccessKey: async () => internalMockedSdk,
        },
      });

      configureInquirerStub(inquirer, {
        list: { credentialsSetupChoice: providerUid },
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
            options: {},
            configurationFilename: 'serverless.yml',
          })
      );

      expect(stdoutData).to.include(
        'Dashboard service is currently unavailable, please try again later'
      );
      expect(stdoutData).not.to.include('Selected provider was successfully linked');
      expect(mockedCreateProviderLink).to.have.been.calledWith(
        'org-uid',
        'instance',
        'appName|someapp|serviceName|someservice|stage|dev|region|us-east-1',
        'provideruid'
      );
    });

    it('Should emit a warning when dashboard is not available when fetching providers', async () => {
      const internalMockedSdk = {
        ...mockedSdk,
        getProviders: async () => {
          const err = new Error('unavailable');
          err.statusCode = 500;
          throw err;
        },
      };
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
        '@serverless/dashboard-plugin/lib/clientUtils': {
          getPlatformClientWithAccessKey: async () => internalMockedSdk,
        },
        '@serverless/utils/config': {
          getLoggedInUser: () => ({}),
        },
      });

      let stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        async () =>
          await mockedStep.run({
            serviceDir: process.cwd(),
            configuration: { provider: { name: 'aws' }, org: 'someorg' },
            configurationFilename: 'serverless.yml',
          })
      );

      expect(stdoutData).to.include('Dashboard service is currently unavailable');
    });
  });
});
