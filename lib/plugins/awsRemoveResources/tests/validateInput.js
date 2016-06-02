'use strict';

const expect = require('chai').expect;
const AwsRemoveResources = require('../awsRemoveResources');
const Serverless = require('../../../Serverless');

describe('#validateInput()', () => {
  const serverless = new Serverless();
  serverless.init();

  let awsRemoveResources;

  beforeEach(() => {
    awsRemoveResources = new AwsRemoveResources(serverless);

    serverless.config.servicePath = true;
    serverless.service.environment = {
      stages: {
        dev: {
          regions: {
            aws_useast1: {},
          },
        },
      },
    };
    awsRemoveResources.options = {
      stage: 'dev',
      region: 'us-east-1',
    };
  });

  it('should throw an error if the stage option is not provided', () => {
    awsRemoveResources.options.stage = false;
    expect(() => awsRemoveResources.validateInput()).to.throw(Error);
  });

  it('should throw an error if the region option is not provided', () => {
    awsRemoveResources.options.region = false;
    expect(() => awsRemoveResources.validateInput()).to.throw(Error);
  });

  it('should throw an error if the stage does not exist in the service', () => {
    awsRemoveResources.options.stage = 'prod';
    expect(() => awsRemoveResources.validateInput()).to.throw(Error);
  });

  it('should throw an error if the region does not exist in the service', () => {
    awsRemoveResources.options.region = 'us-west-2';
    expect(() => awsRemoveResources.validateInput()).to.throw(Error);
  });

  it('should throw an error if not inside a service (servicePath not defined)', () => {
    awsRemoveResources.serverless.config.servicePath = false;
    expect(() => awsRemoveResources.validateInput()).to.throw(Error);
  });
});
