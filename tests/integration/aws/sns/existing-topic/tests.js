'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');
const uuid = require('uuid');

describe('AWS - SNS: Existing topic with single function', function () {
  this.timeout(0);

  const snsTopic = uuid.v4();

  before(() => Utils.createSnsTopic(snsTopic)
    .then((result) => {
      process.env.EXISTING_TOPIC_ARN = result.TopicArn;
    }));

  before(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger function when new message is published', () => Utils
    .publishSnsMessage(snsTopic, 'hello world')
    .delay(60000)
    .then(() => {
      const logs = Utils.getFunctionLogs('hello');
      expect(/aws:sns/g.test(logs)).to.equal(true);
      expect(/hello world/g.test(logs)).to.equal(true);
    })
  );

  after(() => {
    Utils.removeService();
  });

  after(() => {
    Utils.removeSnsTopic(snsTopic);
  });
});
