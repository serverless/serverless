'use strict';

const expect = require('chai').expect;
const AwsRemove = require('../');
const Serverless = require('../../../../Serverless');

describe('#validateInput()', () => {
  const serverless = new Serverless();
  serverless.init();

  let awsRemove;

  beforeEach(() => {
    awsRemove = new AwsRemove(serverless);

    serverless.config.servicePath = true;
    awsRemove.options = {
      stage: 'dev',
      region: 'us-east-1',
    };
  });

  it('should throw an error if not inside a service (servicePath not defined)', () => {
    awsRemove.serverless.config.servicePath = false;
    expect(() => awsRemove.validateInput()).to.throw(Error);
  });
});
