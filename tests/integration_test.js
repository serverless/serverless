'use strict';

const expect = require('chai').expect;
const path = require('path');
const fse = require('fs-extra');
const BbPromise = require('bluebird');
const execSync = require('child_process').execSync;
const Serverless = require('../lib/Serverless');
const AWS = require('aws-sdk');
const testUtils = require('./utils');

const serverless = new Serverless();
serverless.init();
const serverlessExec = path.join(serverless.config.serverlessPath, '..', 'bin', 'serverless');

const tmpDir = testUtils.getTmpDirPath();
fse.mkdirSync(tmpDir);
process.chdir(tmpDir);

const templateName = 'aws-nodejs';
const newServiceName = `service-${(new Date()).getTime().toString()}`;
const stackName = `${newServiceName}-dev`;

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
BbPromise.promisifyAll(CF, { suffix: 'Promised' });

describe('Service Lifecyle Integration Test', () => {
  it('should create service in tmp directory', function () {
    this.timeout(10000);
    execSync(`${serverlessExec} create --template ${templateName}`, { stdio: 'inherit' });
    execSync(`sed -i.bak s/${templateName}/${newServiceName}/g serverless.yml`);
    expect(serverless.utils
      .fileExistsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(serverless.utils
      .fileExistsSync(path.join(tmpDir, 'handler.js'))).to.be.equal(true);
  });

  it('should deploy service to aws', function () {
    this.timeout(0);
    execSync(`${serverlessExec} deploy`, { stdio: 'inherit' });

    return CF.describeStacksPromised({ StackName: stackName })
      .then(d => expect(d.Stacks[0].StackStatus).to.be.equal('UPDATE_COMPLETE'));
  });

  it('should invoke function from aws', function () {
    this.timeout(0);
    const invoked = execSync(`${serverlessExec} invoke --function hello --noGreeting true`);
    const result = JSON.parse(new Buffer(invoked, 'base64').toString());
    expect(result.message).to.be.equal('Go Serverless v1.0! Your function executed successfully!');
  });

  it('should deploy updated service to aws', function () {
    const newHandler =
      `
        'use strict';

        module.exports.hello = (event, context, cb) => cb(null,
          { message: 'Service Update Succeeded' }
        );
      `;

    serverless.utils.writeFileSync(path.join(tmpDir, 'handler.js'), newHandler);
    this.timeout(0);
    execSync(`${serverlessExec} deploy`, { stdio: 'inherit' });
  });

  it('should invoke updated function from aws', function () {
    this.timeout(0);
    const invoked = execSync(`${serverlessExec} invoke --function hello --noGreeting true`);
    const result = JSON.parse(new Buffer(invoked, 'base64').toString());
    expect(result.message).to.be.equal('Service Update Succeeded');
  });

  it('should remove service from aws', function () {
    this.timeout(0);
    execSync(`${serverlessExec} remove`, { stdio: 'inherit' });

    return CF.describeStacksPromised({ StackName: stackName })
      .then(d => expect(d.Stacks[0].StackStatus).to.be.equal('DELETE_COMPLETE'))
      .catch(e => {
        if (e.message.indexOf('does not exist') > -1) return BbPromise.resolve();
        throw new serverless.classes.Error(e);
      });
  });
});
