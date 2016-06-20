'use strict';

const expect = require('chai').expect;
const AwsRemove = require('../index');
const Serverless = require('../../../../Serverless');

describe('#validateInput()', () => {
  const serverless = new Serverless();

  let awsRemove;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsRemove = new AwsRemove(serverless, options);

    serverless.config.servicePath = true;
  });

  it('should throw an error if not inside a service (servicePath not defined)', () => {
    awsRemove.serverless.config.servicePath = false;
    expect(() => awsRemove.validateInput()).to.throw(Error);
  });
});
