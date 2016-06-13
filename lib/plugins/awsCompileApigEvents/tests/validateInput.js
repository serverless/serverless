'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../awsCompileApigEvents');
const Serverless = require('../../../Serverless');

describe('#validate()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.service.resources = { aws: {} };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
  });

  it('should throw an error if the AWS Resources section is not ' +
    'available in the service object', () => {
    expect(() => awsCompileApigEvents.validateInput()).to.throw(Error);
  });
});

