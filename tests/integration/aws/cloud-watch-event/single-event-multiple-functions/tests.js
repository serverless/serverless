'use strict';

const path = require('path');
const expect = require('chai').expect;
const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const _ = require('lodash');
const Utils = require('../../../../utils/index');

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
BbPromise.promisifyAll(CF, { suffix: 'Promised' });

describe('AWS - CloudWathEvent: Single event with multiple functions', () => {
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

  it('should trigger functions when EC2 is stopped', () => Utils
    .stopEc2(instanceId)
    .delay(60000)
    .then(() => {
      const logs1 = Utils.getFunctionLogs('cwe1');
      const logs2 = Utils.getFunctionLogs('cwe2');
      const instanceIdRegex1 = new RegExp(`instance/${instanceId}`, 'g');
      const instanceIdRegex2 = new RegExp(`instance/${instanceId}`, 'g');
      expect(/aws:ec2/g.test(logs1)).to.equal(true);
      expect(/aws:ec2/g.test(logs2)).to.equal(true);
      expect(/"state":"stopping"/g.test(logs1)).to.equal(true);
      expect(/"state":"stopping"/g.test(logs2)).to.equal(true);
      expect(instanceIdRegex1.test(logs1)).to.equal(true);
      expect(instanceIdRegex2.test(logs2)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
