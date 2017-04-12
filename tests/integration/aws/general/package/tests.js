'use strict';

const path = require('path');
const expect = require('chai').expect;
const execSync = require('child_process').execSync;
const AWS = require('aws-sdk');
const fs = require('fs');

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
const Utils = require('../../../../utils/index');

describe('AWS - General: Package', () => {
  let serviceName;

  beforeAll(() => {
    serviceName = Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    execSync(`${Utils.serverlessExec} package`);
  });

  it('should have create cloudformation files and functions zip', () => {
    const deployedFiles = fs.readdirSync(path.join(process.cwd(), '.serverless'));
    expect(deployedFiles[0]).to.equal('cloudformation-template-create-stack.json');
    expect(deployedFiles[1]).to.equal('cloudformation-template-update-stack.json');
    expect(deployedFiles[2]).to.equal('serverless-state.json');
    // Note: noticed the seconds section can vary a lot
    expect(deployedFiles[3]).to.match(/test-[0-9]{1,}-[0-9]{1,}.zip/);
  });

  it('should not found stack from AWS', (done) => {
    CF.describeStackResources({ StackName: serviceName }, (error) => {
      expect(error.message).to.equal(`Stack with id ${serviceName} does not exist`);
      done();
    });
  });
});
