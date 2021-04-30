'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const overrideEnv = require('process-utils/override-env');
const requireUncached = require('ncjsm/require-uncached');

const { expect } = chai;

chai.use(require('chai-as-promised'));

const { join, resolve } = require('path');
const BbPromise = require('bluebird');
const fsp = require('fs').promises;
const { remove: rmDir, outputFile: writeFile } = require('fs-extra');
const { resolveFileProfiles } = require('../../../../../lib/plugins/aws/utils/credentials');

const step = proxyquire('../../../../../lib/cli/interactive-setup/aws-credentials', {
  '../../utils/openBrowser': (url) =>
    BbPromise.try(() => {
      openBrowserUrls.push(url);
    }),
});
const inquirer = require('@serverless/utils/inquirer');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');

const openBrowserUrls = [];

const confirmEmptyWorkingDir = async () =>
  expect(await fsp.readdir(process.cwd())).to.deep.equal([]);

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

  it('Should be effective, at AWS service and no credentials are set', async () =>
    expect(
      await step.isApplicable({
        serviceDir: process.cwd(),
        configuration: { provider: { name: 'aws' } },
        configurationFilename: 'serverless.yml',
      })
    ).to.equal(true));

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

  it("Should not setup if user doesn't the setup", async () => {
    configureInquirerStub(inquirer, { confirm: { shouldSetupAwsCredentials: false } });
    await step.run({ configuration: { provider: {} }, options: {} });
    return confirmEmptyWorkingDir();
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
        confirm: { shouldSetupAwsCredentials: true, hasAwsAccount: false },
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
        confirm: { shouldSetupAwsCredentials: true, hasAwsAccount: true },
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
        confirm: { shouldSetupAwsCredentials: true, hasAwsAccount: true },
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
        confirm: { shouldSetupAwsCredentials: true, hasAwsAccount: true },
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
});
