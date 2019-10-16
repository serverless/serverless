'use strict';

const { join } = require('path');
const { homedir: getHomedir } = require('os');
const { expect } = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const {
  removeAsync: rmDir,
  lstatAsync: lstat,
  outputFileAsync: writeFile,
} = BbPromise.promisifyAll(require('fs-extra'));
const { resolveFileProfiles } = require('../aws/utils/credentials');
const inquirer = require('./inquirer');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const runServerless = require('../../../tests/utils/run-serverless');

const fixturesPath = join(__dirname, 'test/fixtures');

const openBrowserUrls = [];
const modulesCacheStub = {
  [require.resolve('../../utils/openBrowser')]: url =>
    BbPromise.try(() => {
      openBrowserUrls.push(url);
    }),
  // Ensure to rely on same inquirer module that we mock in tests
  [require.resolve('./inquirer')]: inquirer,
};

describe('interactiveCli: setupAws', () => {
  const awsProjectPath = join(fixturesPath, 'some-aws-service');
  const accessKeyId = 'AKIAIOSFODNN7EXAMPLE';
  const secretAccessKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  let backupIsTTY;

  before(() => {
    backupIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
  });
  after(() => (process.stdin.isTTY = backupIsTTY));

  afterEach(() => {
    openBrowserUrls.length = 0;
    sinon.restore();
  });

  it('Should be ineffective, when not at service path', () =>
    runServerless({
      cwd: fixturesPath,
      pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
      lifecycleHookNamesWhitelist: ['interactiveCli:setupAws'],
    }));

  it('Should be ineffective, when not at AWS service', () =>
    runServerless({
      cwd: join(fixturesPath, 'some-other-service'),
      pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
      lifecycleHookNamesWhitelist: ['interactiveCli:setupAws'],
    }));

  it('Should be ineffective, when credentials are set in environment', () =>
    runServerless({
      cwd: awsProjectPath,
      env: { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey },
      pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
      lifecycleHookNamesWhitelist: ['interactiveCli:setupAws'],
    }));

  it("Should not setup if user doesn't the setup", () => {
    configureInquirerStub(inquirer, { confirm: { shouldSetupAwsCredentials: false } });
    return runServerless({
      cwd: awsProjectPath,
      pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
      lifecycleHookNamesWhitelist: ['interactiveCli:setupAws'],
    });
  });

  describe('AWS config handling', () => {
    const credentialsDirPath = join(getHomedir(), '.aws');
    const credentialsFilePath = join(credentialsDirPath, 'credentials');

    before(() => {
      // Abort if credentials are found in home directory
      // (it should not be the case, as home directory is mocked to point temp dir)
      return lstat(credentialsDirPath).then(
        () => {
          throw new Error('Unexpected ~/.aws directory, related tests aborted');
        },
        error => {
          if (error.code === 'ENOENT') return;
          throw error;
        }
      );
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

      it('Should be ineffective, When credentials are set in AWS config', () =>
        runServerless({
          cwd: awsProjectPath,
          pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
          lifecycleHookNamesWhitelist: ['interactiveCli:setupAws'],
        }));
    });

    it('Should setup credentials for users not having an AWS account', () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldSetupAwsCredentials: true, hasAwsAccount: false },
        input: {
          createAwsAccountPrompt: '',
          generateAwsCredsPrompt: '',
          accessKeyId,
          secretAccessKey,
        },
      });
      return runServerless({
        cwd: awsProjectPath,
        pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
        lifecycleHookNamesWhitelist: ['interactiveCli:setupAws'],
        modulesCacheStub,
      }).then(() => {
        expect(openBrowserUrls.length).to.equal(2);
        expect(openBrowserUrls[0].includes('signup')).to.be.true;
        expect(openBrowserUrls[1].includes('console.aws.amazon.com')).to.be.true;
        return resolveFileProfiles().then(profiles => {
          expect(profiles).to.deep.equal(new Map([['default', { accessKeyId, secretAccessKey }]]));
        });
      });
    });

    it('Should setup credentials for users having an AWS account', () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldSetupAwsCredentials: true, hasAwsAccount: true },
        input: { generateAwsCredsPrompt: '', accessKeyId, secretAccessKey },
      });
      return runServerless({
        cwd: awsProjectPath,
        pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
        lifecycleHookNamesWhitelist: ['interactiveCli:setupAws'],
        modulesCacheStub,
      }).then(() => {
        expect(openBrowserUrls.length).to.equal(1);
        expect(openBrowserUrls[0].includes('console.aws.amazon.com')).to.be.true;
        return resolveFileProfiles().then(profiles => {
          expect(profiles).to.deep.equal(new Map([['default', { accessKeyId, secretAccessKey }]]));
        });
      });
    });

    it('Should not accept invalid access key id', () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldSetupAwsCredentials: true, hasAwsAccount: true },
        input: { generateAwsCredsPrompt: '', accessKeyId: 'foo', secretAccessKey },
      });
      return runServerless({
        cwd: awsProjectPath,
        pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
        lifecycleHookNamesWhitelist: ['interactiveCli:setupAws'],
        modulesCacheStub,
      }).then(
        () => {
          throw new Error('Unexpected');
        },
        error => expect(error.code).to.equal('INVALID_ANSWER')
      );
    });

    it('Should not accept invalid secret access key', () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldSetupAwsCredentials: true, hasAwsAccount: true },
        input: { generateAwsCredsPrompt: '', accessKeyId, secretAccessKey: 'foo' },
      });
      return runServerless({
        cwd: awsProjectPath,
        pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
        lifecycleHookNamesWhitelist: ['interactiveCli:setupAws'],
        modulesCacheStub,
      }).then(
        () => {
          throw new Error('Unexpected');
        },
        error => expect(error.code).to.equal('INVALID_ANSWER')
      );
    });
  });
});
