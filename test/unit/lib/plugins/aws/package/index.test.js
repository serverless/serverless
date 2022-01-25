'use strict';

const AwsProvider = require('../../../../../../lib/plugins/aws/provider');
const AwsPackage = require('../../../../../../lib/plugins/aws/package/index');
const Serverless = require('../../../../../../lib/Serverless');
const CLI = require('../../../../../../lib/classes/CLI');
const expect = require('chai').expect;
const path = require('path');

describe('AwsPackage', () => {
  let awsPackage;
  let serverless;
  let options;

  beforeEach(() => {
    serverless = new Serverless();
    options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.serviceDir = 'foo';
    serverless.cli = new CLI(serverless);
    awsPackage = new AwsPackage(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      expect(awsPackage.serverless).to.equal(serverless);
    });

    it('should set options', () => {
      expect(awsPackage.options).to.equal(options);
    });

    it('should set the service path if provided', () => {
      expect(awsPackage.servicePath).to.equal('foo');
    });

    it('should default to an empty service path if not provided', () => {
      serverless.serviceDir = false;
      awsPackage = new AwsPackage(serverless, options);

      expect(awsPackage.servicePath).to.equal('');
    });

    it('should use the options package path if provided', () => {
      options.package = 'package-options';
      awsPackage = new AwsPackage(serverless, options);

      expect(awsPackage.packagePath).to.equal('package-options');
    });

    it('should use the services package path if provided', () => {
      serverless.service = {
        package: {
          path: 'package-service',
        },
      };
      awsPackage = new AwsPackage(serverless, options);

      expect(awsPackage.packagePath).to.equal('package-service');
    });

    it('should default to the .serverless directory as the package path', () => {
      expect(awsPackage.packagePath).to.equal(path.join('foo', '.serverless'));
    });

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsPackage.provider).to.be.instanceof(AwsProvider));

    it('should have commands', () => expect(awsPackage.commands).to.be.not.empty);

    it('should have hooks', () => expect(awsPackage.hooks).to.be.not.empty);
  });
});
