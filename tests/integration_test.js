'use strict';

const expect = require('chai').expect;
const path = require('path');
const os = require('os');
const fse = require('fs-extra');
const BbPromise = require('bluebird');
const execSync = require('child_process').execSync;
const Serverless = require('../lib/Serverless');
const AWS = require('aws-sdk');

const serverless = new Serverless();
serverless.init();
const serverlessExec = path.join(serverless.config.serverlessPath, '..', 'bin', 'serverless');

const serviceName = `integration-test-${(new Date).getTime().toString()}`;
const providerName = 'aws';
const tmpDir = path.join(os.tmpdir(), (new Date).getTime().toString());
fse.mkdirSync(tmpDir);
process.chdir(tmpDir);

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
BbPromise.promisifyAll(CF, { suffix: 'Promised' });

describe('Service Lifecyle Integration Test', () => {
  it('should create service in tmp directory', () => {
    execSync(`${serverlessExec} create --name ${
      serviceName
      } --provider ${
      providerName
      }`, { stdio: 'inherit' });

    process.chdir(path.join(tmpDir, serviceName));
    expect(serverless.utils
      .fileExistsSync(path.join(tmpDir, serviceName, 'serverless.yaml'))).to.be.equal(true);
    expect(serverless.utils
      .fileExistsSync(path.join(tmpDir, serviceName, 'serverless.env.yaml'))).to.be.equal(true);
    expect(serverless.utils
      .fileExistsSync(path.join(tmpDir, serviceName, 'handler.js'))).to.be.equal(true);
  });

  it('should deploy service to aws', function () {
    this.timeout(0);
    execSync(`${serverlessExec} deploy`, { stdio: 'inherit' });

    return CF.describeStacksPromised({ StackName: `${serviceName}-dev` })
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

    serverless.utils.writeFileSync(path.join(tmpDir, serviceName, 'handler.js'), newHandler);
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

    return CF.describeStacksPromised({ StackName: `${serviceName}-dev` })
      .then(d => expect(d.Stacks[0].StackStatus).to.be.equal('DELETE_COMPLETE'))
      .catch(e => {
        if (e.message.indexOf('does not exist') > -1) return BbPromise.resolve();
        throw new serverless.classes.Error(e);
      });
  });
});
