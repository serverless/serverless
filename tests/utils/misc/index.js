'use strict';

const path = require('path');
const fse = require('fs-extra');
const BbPromise = require('bluebird');
const { execSync } = require('child_process');
const chalk = require('chalk');
const { replaceTextInFile } = require('../fs');

const logger = console;

const region = 'us-east-1';

const testServiceIdentifier = 'integ-test';

const serverlessExec = path.resolve(__dirname, '..', '..', '..', 'bin', 'serverless');

const serviceNameRegex = new RegExp(`${testServiceIdentifier}-d+`);

function getServiceName() {
  const hrtime = process.hrtime();
  return `${testServiceIdentifier}-${hrtime[1]}`;
}

function deployService() {
  execSync(`${serverlessExec} deploy`);
}

function removeService() {
  execSync(`${serverlessExec} remove`);
}

function replaceEnv(values) {
  const originals = {};
  for (const key of Object.keys(values)) {
    if (process.env[key]) {
      originals[key] = process.env[key];
    } else {
      originals[key] = 'undefined';
    }
    if (values[key] === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
  return originals;
}

function createTestService(templateName, tmpDir, testServiceDir) {
  const serviceName = getServiceName();

  fse.mkdirsSync(tmpDir);
  process.chdir(tmpDir);

  // create a new Serverless service
  execSync(`${serverlessExec} create --template ${templateName}`);

  if (testServiceDir) {
    fse.copySync(testServiceDir, tmpDir, { clobber: true, preserveTimestamps: true });
  }

  replaceTextInFile('serverless.yml', templateName, serviceName);

  process.env.TOPIC_1 = `${serviceName}-1`;
  process.env.TOPIC_2 = `${serviceName}-1`;
  process.env.BUCKET_1 = `${serviceName}-1`;
  process.env.BUCKET_2 = `${serviceName}-2`;
  process.env.COGNITO_USER_POOL_1 = `${serviceName}-1`;
  process.env.COGNITO_USER_POOL_2 = `${serviceName}-2`;

  // return the name of the CloudFormation stack
  return serviceName;
}

function getFunctionLogs(functionName) {
  const logs = execSync(`${serverlessExec} logs --function ${functionName} --noGreeting true`);
  const logsString = Buffer.from(logs, 'base64').toString();
  process.stdout.write(logsString);
  return logsString;
}

function persistentRequest(...args) {
  const func = args[0];
  const funcArgs = args.slice(1);
  const MAX_TRIES = 5;
  return new BbPromise((resolve, reject) => {
    const doCall = (numTry) => {
      return func.apply(this, funcArgs).then(resolve, e => {
        if (numTry < MAX_TRIES &&
          ((e.providerError && e.providerError.retryable) || e.statusCode === 429)) {
          logger.log(
            [`Recoverable error occurred (${e.message}), sleeping for 5 seconds.`,
              `Try ${numTry + 1} of ${MAX_TRIES}`].join(' ')
          );
          setTimeout(doCall, 5000, numTry + 1);
        } else {
          reject(e);
        }
      });
    };
    return doCall(0);
  });
}

const skippedWithNotice = [];

function skipWithNotice(context, reason) {
  if (process.env.CI) return; // Do not tolerate skips in CI environment
  skippedWithNotice.push({ context, reason });
  process.stdout.write(chalk.yellow(`\n Skipped due to: ${chalk.red(reason)}\n\n`));
  context.skip();
}

function skipOnWindowsDisabledSymlinks(error, context) {
  if (error.code !== 'EPERM' || process.platform !== 'win32') return;
  skipWithNotice(context, 'Missing admin rights to create symlinks');
}

module.exports = {
  logger,
  region,
  testServiceIdentifier,
  serverlessExec,
  serviceNameRegex,
  getServiceName,
  deployService,
  removeService,
  replaceEnv,
  createTestService,
  getFunctionLogs,
  persistentRequest,
  skippedWithNotice,
  skipWithNotice,
  skipOnWindowsDisabledSymlinks,
};
