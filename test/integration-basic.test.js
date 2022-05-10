'use strict';

const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const stripAnsi = require('strip-ansi');
const { expect } = require('chai');
const log = require('log').get('serverless:test');
const spawn = require('child-process-ext/spawn');
const resolveAwsEnv = require('@serverless/test/resolve-aws-env');
const hasFailed = require('@serverless/test/has-failed');
const awsRequest = require('@serverless/test/aws-request');
const CloudFormationService = require('aws-sdk').CloudFormation;
const { getTmpDirPath } = require('./utils/fs');

const serverlessExec = require('./serverless-binary');

describe('Service Lifecyle Integration Test', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  const templateName = 'aws-nodejs';
  const tmpDir = getTmpDirPath();
  const env = resolveAwsEnv();
  const spawnOptions = {
    cwd: tmpDir,
    env,
    // As in invoke we optionally read stdin, we need to ensure it's closed
    // See https://github.com/sindresorhus/get-stdin/issues/13#issuecomment-279234249
    shouldCloseStdin: true,
  };
  let serviceName;
  let StackName;

  before(() => {
    serviceName = `test-basic-${process.hrtime()[1]}`;
    StackName = `${serviceName}-dev`;
    log.notice(`Temporary path: ${tmpDir}`);
    fse.mkdirsSync(tmpDir);
  });

  // Do not continue if any of the tests failed
  beforeEach(function () {
    if (hasFailed(this.test.parent)) this.skip();
  });

  after(async () => {
    try {
      await awsRequest(CloudFormationService, 'describeStacks', { StackName });
    } catch (error) {
      if (error.message.indexOf('does not exist') > -1) return;
      throw error;
    }
    await spawn(serverlessExec, ['remove'], { cwd: tmpDir, env });
  });

  it('should create service in tmp directory', async () => {
    await spawn(
      serverlessExec,
      ['create', '--template', templateName, '--name', serviceName],
      spawnOptions
    );
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'handler.js'))).to.be.equal(true);
  });

  it('should deploy service to aws', async () => {
    await spawn(serverlessExec, ['deploy'], { cwd: tmpDir, env });

    const d = await awsRequest(CloudFormationService, 'describeStacks', { StackName });
    expect(d.Stacks[0].StackStatus).to.be.equal('UPDATE_COMPLETE');
  });

  it('should invoke function from aws', async () => {
    const { stdoutBuffer: invoked } = await spawn(
      serverlessExec,
      ['invoke', '--function', 'hello'],
      spawnOptions
    );
    const result = JSON.parse(invoked);
    // parse it once again because the body is stringified to be LAMBDA-PROXY ready
    const message = JSON.parse(result.body).message;
    expect(message).to.be.equal('Go Serverless v1.0! Your function executed successfully!');
  });

  it('should deploy updated service to aws', () => {
    const newHandler = `
        'use strict';

        module.exports.hello = (event, context, cb) => cb(null,
          { message: 'Service Update Succeeded' }
        );
      `;

    fs.writeFileSync(path.join(tmpDir, 'handler.js'), newHandler);
    return spawn(serverlessExec, ['deploy'], spawnOptions);
  });

  it('should invoke updated function from aws', async () => {
    const { stdoutBuffer: invoked } = await spawn(
      serverlessExec,
      ['invoke', '--function', 'hello'],
      spawnOptions
    );
    const result = JSON.parse(invoked);
    expect(result.message).to.be.equal('Service Update Succeeded');
  });

  it('should list existing deployments and roll back to first deployment', async () => {
    let timestamp;
    const { stdoutBuffer: listDeploys } = await spawn(
      serverlessExec,
      ['deploy', 'list'],
      spawnOptions
    );
    const output = stripAnsi(listDeploys.toString());
    const match = output.match(new RegExp('Timestamp: (.+)'));
    if (match) {
      timestamp = match[1];
    }
    expect(timestamp).to.not.undefined;

    await spawn(serverlessExec, ['rollback', '-t', timestamp], { cwd: tmpDir, env });

    const { stdoutBuffer: invoked } = await spawn(
      serverlessExec,
      ['invoke', '--function', 'hello'],
      spawnOptions
    );
    const result = JSON.parse(invoked);
    // parse it once again because the body is stringified to be LAMBDA-PROXY ready
    const message = JSON.parse(result.body).message;
    expect(message).to.be.equal('Go Serverless v1.0! Your function executed successfully!');
  });

  it('should remove service from aws', async () => {
    await spawn(serverlessExec, ['remove'], { cwd: tmpDir, env });

    const d = await (async () => {
      try {
        return await awsRequest(CloudFormationService, 'describeStacks', { StackName });
      } catch (error) {
        if (error.message.indexOf('does not exist') > -1) return null;
        throw error;
      }
    })();
    if (!d) return;
    expect(d.Stacks[0].StackStatus).to.be.equal('DELETE_COMPLETE');
  });
});
