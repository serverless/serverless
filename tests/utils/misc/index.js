'use strict';

const path = require('path');
const fse = require('fs-extra');
const BbPromise = require('bluebird');
const CloudWatchLogsSdk = require('aws-sdk/clients/cloudwatchlogs');
const { execSync } = require('../child-process');
const { readYamlFile, writeYamlFile } = require('../fs');

const logger = console;

const region = 'us-east-1';
const cloudWatchLogsSdk = new CloudWatchLogsSdk({ region });

const testServiceIdentifier = 'integ-test';

const serverlessExec = path.resolve(__dirname, '..', '..', '..', 'bin', 'serverless');

const serviceNameRegex = new RegExp(`${testServiceIdentifier}-d+`);

function getServiceName() {
  const hrtime = process.hrtime();
  return `${testServiceIdentifier}-${hrtime[1]}`;
}

function deployService(cwd) {
  execSync(`${serverlessExec} deploy`, { cwd });
}

function removeService(cwd) {
  execSync(`${serverlessExec} remove`, { cwd });
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

function createTestService(
  tmpDir,
  options = {
    // Either templateName or templateDir have to be provided
    templateName: null, // Generic template to use (e.g. 'aws-nodejs')
    templateDir: null, // Path to custom pre-prepared service template
    filesToAdd: [], // Array of additional files to add to the service directory
    serverlessConfigHook: null, // Eventual hook that allows to customize serverless config
  }
) {
  const serviceName = getServiceName();

  fse.mkdirsSync(tmpDir);

  if (options.templateName) {
    // create a new Serverless service
    execSync(`${serverlessExec} create --template ${options.templateName}`, { cwd: tmpDir });
  } else if (options.templateDir) {
    fse.copySync(options.templateDir, tmpDir, { clobber: true, preserveTimestamps: true });
  } else {
    throw new Error("Either 'templateName' or 'templateDir' options have to be provided");
  }

  if (options.filesToAdd && options.filesToAdd.length) {
    options.filesToAdd.forEach(filePath => {
      fse.copySync(filePath, tmpDir, { preserveTimestamps: true });
    });
  }

  const serverlessFilePath = path.join(tmpDir, 'serverless.yml');
  const serverlessConfig = readYamlFile(serverlessFilePath);
  // Ensure unique service name
  serverlessConfig.service = serviceName;
  if (options.serverlessConfigHook) options.serverlessConfigHook(serverlessConfig);
  writeYamlFile(serverlessFilePath, serverlessConfig);

  process.env.TOPIC_1 = `${serviceName}-1`;
  process.env.TOPIC_2 = `${serviceName}-1`;
  process.env.BUCKET_1 = `${serviceName}-1`;
  process.env.BUCKET_2 = `${serviceName}-2`;
  process.env.COGNITO_USER_POOL_1 = `${serviceName}-1`;
  process.env.COGNITO_USER_POOL_2 = `${serviceName}-2`;

  return serverlessConfig;
}

function getFunctionLogs(cwd, functionName) {
  try {
    const logs = execSync(`${serverlessExec} logs --function ${functionName} --noGreeting true`, {
      cwd,
    });
    const logsString = Buffer.from(logs, 'base64').toString();
    process.stdout.write(logsString);
    return logsString;
  } catch (_) {
    // Attempting to read logs before first invocation will will result in a "No existing streams for the function" error
    return null;
  }
}

function waitForFunctionLogs(cwd, functionName, startMarker, endMarker) {
  let logs;
  return new BbPromise(resolve => {
    const interval = setInterval(() => {
      logs = getFunctionLogs(cwd, functionName);
      if (logs && logs.includes(startMarker) && logs.includes(endMarker)) {
        clearInterval(interval);
        return resolve(logs);
      }
      return null;
    }, 2000);
  });
}

/**
 * Cloudwatch logs when turned on, are usually take some time for being effective
 * This function allows to confirm that new setting (turned on cloudwatch logs)
 * is effective after stack deployment
 */
function confirmCloudWatchLogs(logGroupName, trigger, timeout = 60000) {
  const startTime = Date.now();
  return trigger()
    .then(() => cloudWatchLogsSdk.filterLogEvents({ logGroupName }).promise())
    .then(result => {
      if (result.events.length) return result.events;
      const duration = Date.now() - startTime;
      if (duration > timeout) return [];
      return confirmCloudWatchLogs(logGroupName, trigger, timeout - duration);
    });
}

function persistentRequest(...args) {
  const func = args[0];
  const funcArgs = args.slice(1);
  const MAX_TRIES = 5;
  return new BbPromise((resolve, reject) => {
    const doCall = numTry => {
      return func.apply(this, funcArgs).then(resolve, e => {
        if (
          numTry < MAX_TRIES &&
          ((e.providerError && e.providerError.retryable) || e.statusCode === 429)
        ) {
          logger.log(
            [
              `Recoverable error occurred (${e.message}), sleeping for 5 seconds.`,
              `Try ${numTry + 1} of ${MAX_TRIES}`,
            ].join(' ')
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  logger,
  region,
  confirmCloudWatchLogs,
  testServiceIdentifier,
  serverlessExec,
  serviceNameRegex,
  getServiceName,
  deployService,
  removeService,
  replaceEnv,
  createTestService,
  getFunctionLogs,
  waitForFunctionLogs,
  persistentRequest,
  wait,
};
