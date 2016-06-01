'use strict';

const expect = require('chai').expect;
const AwsDeploy = require('../awsDeploy');
const Serverless = require('../../../Serverless');

const serverless = new Serverless();
serverless.init();
const awsDeploy = new AwsDeploy(serverless);
serverless.config.servicePath = true;
serverless.service.environment = {
  vars: {},
  stages: {
    dev: {
      vars: {},
      regions: {
        aws_useast1: {
          vars: {},
        },
      },
    },
  },
};
serverless.service.functions = {
  hello: {
    handler: true,
  },
};
awsDeploy.options = {
  stage: 'dev',
  region: 'us-east-1',
};

describe('#validateInput()', () => {
  it('should throw error if stage option not provided', () => {
    awsDeploy.options.stage = false;
    expect(() => awsDeploy.validateInput()).to.throw(Error);
    awsDeploy.options.stage = 'dev';
  });

  it('should throw error if region option not provided', () => {
    awsDeploy.options.region = false;
    expect(() => awsDeploy.validateInput()).to.throw(Error);
    awsDeploy.options.region = 'us-east-1';
  });

  it('should throw error if stage does not exist in service', () => {
    awsDeploy.options.stage = 'prod';
    expect(() => awsDeploy.validateInput()).to.throw(Error);
    awsDeploy.options.stage = 'dev';
  });

  it('should throw error if region does not exist in service', () => {
    awsDeploy.options.region = 'us-west-2';
    expect(() => awsDeploy.validateInput()).to.throw(Error);
    awsDeploy.options.region = 'us-east-1';
  });

  it('should throw error if not inside service (servicePath not defined)', () => {
    awsDeploy.serverless.config.servicePath = false;
    expect(() => awsDeploy.validateInput()).to.throw(Error);
    awsDeploy.serverless.config.servicePath = true;
  });

  it('should throw error if region vars object does not exist', () => {
    awsDeploy.serverless.service.environment.stages.dev.regions.aws_useast1 = {};
    expect(() => awsDeploy.validateInput()).to.throw(Error);
    awsDeploy.serverless.service.environment.stages.dev.regions.aws_useast1 = {
      vars: {},
    };
  });

  it('should throw error if handler does not exist in function', () => {
    awsDeploy.serverless.service.functions.hello.handler = false;
    expect(() => awsDeploy.validateInput()).to.throw(Error);
    awsDeploy.serverless.service.functions.hello.handler = true;
  });

  it('should add core resources and merge custom resources', () => {
    awsDeploy.serverless.service.resources.aws = {
      Resources: {
        fakeResource: {
          fakeProp: 'fakeValue',
        },
      },
    };
    return awsDeploy.validateInput().then(() => {
      expect(Object.keys(awsDeploy.serverless.service.resources
        .aws.Resources).length).to.be.equal(4);
    });
  });
});

