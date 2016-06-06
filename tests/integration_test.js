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
const stageName = 'dev';
const regionName = 'us-east-1';
const tmpDir = path.join(os.tmpdir(), (new Date).getTime().toString());
fse.mkdirSync(tmpDir);
process.chdir(tmpDir);

describe('Service Lifecyle Integration Test', () => {
  it('should create service in tmp directory', () => {
    execSync(`${serverlessExec} create --name ${
      serviceName
      } --stage ${
      stageName
      } --region ${
      regionName
      }`);

    process.chdir(path.join(tmpDir, serviceName));
    expect(serverless.utils
      .fileExistsSync(path.join(tmpDir, serviceName, 'serverless.yaml'))).to.be.equal(true);
    expect(serverless.utils
      .fileExistsSync(path.join(tmpDir, serviceName, 'serverless.env.yaml'))).to.be.equal(true);
    expect(serverless.utils
      .fileExistsSync(path.join(tmpDir, serviceName, 'handler.js'))).to.be.equal(true);
    expect(serverless.utils
      .fileExistsSync(path.join(tmpDir, serviceName, 'package.json'))).to.be.equal(true);
  });

  it('should deploy service to aws', function () {
    this.timeout(0);
    execSync(`${serverlessExec} deploy --stage ${
      stageName
      } --region ${
      regionName
      }`);
  });

  it('should invoke function from aws', function () {
    this.timeout(0);
    const invoked = execSync(`${serverlessExec} invoke --function hello --stage ${
      stageName
      } --region ${
      regionName
      }`);
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
    execSync(`${serverlessExec} deploy --stage ${
      stageName
      } --region ${
      regionName
      }`);
  });

  it('should invoke updated function from aws', function () {
    this.timeout(0);
    const invoked = execSync(`${serverlessExec} invoke --function hello --stage ${
      stageName
      } --region ${
      regionName
      }`);
    const result = JSON.parse(new Buffer(invoked, 'base64').toString());
    expect(result.message).to.be.equal('Service Update Succeeded');
  });

  it('should remove service from aws', function () {
    this.timeout(0);
    execSync(`${serverlessExec} remove --stage ${
      stageName
      } --region ${
      regionName
      }`);

    const CF = new AWS.CloudFormation({ region: regionName });
    BbPromise.promisifyAll(CF, { suffix: 'Promised' });

    return CF.describeStacksPromised({ StackName: `${serviceName}-${stageName}` })
      .then(d => expect(d.Stacks[0].StackStatus).to.be.equal('DELETE_IN_PROGRESS'));
  });
});
