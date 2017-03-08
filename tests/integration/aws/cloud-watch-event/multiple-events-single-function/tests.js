'use strict';

const path = require('path');
const expect = require('chai').expect;
const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const _ = require('lodash');
const Utils = require('../../../../utils/index');

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
BbPromise.promisifyAll(CF, { suffix: 'Promised' });

describe('AWS - CloudWathEvent: multiple events with single function', () => {
  let stackName;
  let instanceId;

  beforeAll(() => {
    stackName = Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should expose the instanceId in the CloudFormation Outputs', () =>
    CF.describeStacksPromised({ StackName: stackName })
      .then((result) => _.find(result.Stacks[0].Outputs,
        { OutputKey: 'InstanceId' }).OutputValue)
      .then((id) => {
        instanceId = id;
      })
  );

  it('should trigger function when EC2 is stopped', () => Utils
    .stopEc2(instanceId)
    .delay(60000)
    .then(() => {
      const logs = Utils.getFunctionLogs('cwe1');
      const instanceIdRegex = new RegExp(`instance/${instanceId}`, 'g');
      expect(/aws:ec2/g.test(logs)).to.equal(true);
      expect(/"state":"stopping"/g.test(logs)).to.equal(true);
      expect(instanceIdRegex.test(logs)).to.equal(true);
    })
  );

  it('should trigger function when EC2 is started', () => Utils
    .startEc2(instanceId)
    .delay(60000)
    .then(() => {
      const logs = Utils.getFunctionLogs('cwe1');
      const instanceIdRegex = new RegExp(`instance/${instanceId}`, 'g');
      expect(/aws:ec2/g.test(logs)).to.equal(true);
      expect(/"state":"pending"/g.test(logs)).to.equal(true);
      expect(instanceIdRegex.test(logs)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
