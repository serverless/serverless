'use strict';

const AwsProvider = require('../provider/awsProvider');
const AwsPlan = require('./index');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
const expect = require('chai').expect;

describe('AwsPlan', () => {
  let awsPlan;
  let serverless;
  let options;

  beforeEach(() => {
    serverless = new Serverless();
    options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.config.servicePath = 'foo';
    serverless.cli = new CLI(serverless);
    awsPlan = new AwsPlan(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => expect(awsPlan.serverless).to.equal(serverless));

    it('should set options', () => expect(awsPlan.options).to.equal(options));

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsPlan.provider).to.be.instanceof(AwsProvider));

    it('should have commands', () => expect(awsPlan.commands).to.be.not.empty);

    it('should have hooks', () => expect(awsPlan.hooks).to.be.not.empty);
  });
});
