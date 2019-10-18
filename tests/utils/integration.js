// Integration tests related utils

'use strict';

const path = require('path');
const fse = require('fs-extra');
const spawn = require('child-process-ext/spawn');
const { getServiceName } = require('./misc');
const { readYamlFile, writeYamlFile } = require('./fs');

const serverlessExec = path.resolve(__dirname, '..', '..', 'bin', 'serverless');

async function createTestService(
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
    await spawn(serverlessExec, ['create', '--template', options.templateName], { cwd: tmpDir });
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

async function deployService(cwd) {
  return spawn(serverlessExec, ['deploy'], { cwd });
}

async function removeService(cwd) {
  return spawn(serverlessExec, ['remove'], { cwd });
}

module.exports = {
  createTestService,
  deployService,
  removeService,
};
