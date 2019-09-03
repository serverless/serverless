'use strict';

const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const AWS = require('aws-sdk');
const stripAnsi = require('strip-ansi');
const { expect } = require('chai');
const spawn = require('child-process-ext/spawn');
const { getTmpDirPath } = require('../utils/fs');
const { region, getServiceName } = require('../utils/misc');

const serverlessExec = path.join(__dirname, '..', '..', 'bin', 'serverless');

const CF = new AWS.CloudFormation({ region });

describe('Service Lifecyle Integration Test', function() {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  const templateName = 'aws-nodejs';
  const tmpDir = getTmpDirPath();
  let serviceName;
  let StackName;

  before(() => {
    serviceName = getServiceName();
    StackName = `${serviceName}-dev`;
    console.info(`Temporary path: ${tmpDir}`);
    fse.mkdirsSync(tmpDir);
  });

  it('should create service in tmp directory', async () => {
    await spawn(serverlessExec, ['create', '--template', templateName, '--name', serviceName], {
      cwd: tmpDir,
    });
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'handler.js'))).to.be.equal(true);
  });

  it('should deploy service to aws', async () => {
    await spawn(serverlessExec, ['deploy'], { cwd: tmpDir });

    const d = await CF.describeStacks({ StackName }).promise();
    expect(d.Stacks[0].StackStatus).to.be.equal('UPDATE_COMPLETE');
  });

  it('should invoke function from aws', async () => {
    const { stdoutBuffer: invoked } = await spawn(
      serverlessExec,
      ['invoke', '--function', 'hello', '--noGreeting', 'true'],
      {
        cwd: tmpDir,
        // As in invoke we optionally read stdin, we need to ensure it's closed
        // See https://github.com/sindresorhus/get-stdin/issues/13#issuecomment-279234249
        shouldCloseStdin: true,
      }
    );
    const result = JSON.parse(Buffer.from(invoked, 'base64').toString());
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
    return spawn(serverlessExec, ['deploy'], { cwd: tmpDir });
  });

  it('should invoke updated function from aws', async () => {
    const { stdoutBuffer: invoked } = await spawn(
      serverlessExec,
      ['invoke', '--function', 'hello', '--noGreeting', 'true'],
      {
        cwd: tmpDir,
        // As in invoke we optionally read stdin, we need to ensure it's closed
        // See https://github.com/sindresorhus/get-stdin/issues/13#issuecomment-279234249
        shouldCloseStdin: true,
      }
    );
    const result = JSON.parse(Buffer.from(invoked, 'base64').toString());
    expect(result.message).to.be.equal('Service Update Succeeded');
  });

  it('should list existing deployments and roll back to first deployment', async () => {
    let timestamp;
    const { stdoutBuffer: listDeploys } = await spawn(serverlessExec, ['deploy', 'list'], {
      cwd: tmpDir,
    });
    const output = stripAnsi(listDeploys.toString());
    const match = output.match(new RegExp('Datetime: (.+)'));
    if (match) {
      timestamp = match[1];
    }
    // eslint-disable-next-line no-unused-expressions
    expect(timestamp).to.not.undefined;

    await spawn(serverlessExec, ['rollback', '-t', timestamp], { cwd: tmpDir });

    const { stdoutBuffer: invoked } = await spawn(
      serverlessExec,
      ['invoke', '--function', 'hello', '--noGreeting', 'true'],
      {
        cwd: tmpDir,
        // As in invoke we optionally read stdin, we need to ensure it's closed
        // See https://github.com/sindresorhus/get-stdin/issues/13#issuecomment-279234249
        shouldCloseStdin: true,
      }
    );
    const result = JSON.parse(Buffer.from(invoked, 'base64').toString());
    // parse it once again because the body is stringified to be LAMBDA-PROXY ready
    const message = JSON.parse(result.body).message;
    expect(message).to.be.equal('Go Serverless v1.0! Your function executed successfully!');
  });

  it('should remove service from aws', async () => {
    await spawn(serverlessExec, ['remove'], { cwd: tmpDir });

    const d = await (async () => {
      try {
        return await CF.describeStacks({ StackName }).promise();
      } catch (error) {
        if (error.message.indexOf('does not exist') > -1) return null;
        throw error;
      }
    })();
    if (!d) return;
    expect(d.Stacks[0].StackStatus).to.be.equal('DELETE_COMPLETE');
  });
});
