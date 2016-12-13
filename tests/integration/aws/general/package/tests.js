'use strict';

const path = require('path');
const expect = require('chai').expect;
const execSync = require('child_process').execSync;
const AWS = require('aws-sdk');
const EOL = require('os').EOL;
const fs = require('fs');

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
const Utils = require('../../../../utils/index');

describe('AWS - General: Deployment with --noDeploy', function () {
  this.timeout(0);
  let serviceName;
  let deploy;

  before(() => {
    serviceName = Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    deploy = execSync(`${Utils.serverlessExec} deploy --noDeploy`);
  });

  it('should deploy package with --noDeploy flag', () => {
    const result = new Buffer(deploy, 'base64').toString();
    const resultLines = result.split(EOL);
    expect(resultLines[1]).to.have.string('--noDeploy');
  });

  it('should have create cloudformation files and functions zip', () => {
    const deployedFiles = fs.readdirSync(path.join(process.cwd(), '.serverless'));
    expect(deployedFiles[0]).to.equal('cloudformation-template-create-stack.json');
    expect(deployedFiles[1]).to.equal('cloudformation-template-update-stack.json');
    expect(deployedFiles[2]).to.match(/service-[0-9]{13}.zip/);
  });

  it('should not found stack from AWS', (done) => {
    CF.describeStackResources({ StackName: serviceName }, (error) => {
      expect(error.message).to.equal(`Stack with id ${serviceName} does not exist`);
      done();
    });
  });
});
