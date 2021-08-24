'use strict';

const expect = require('chai').expect;
const AwsPackage = require('../../../../../../../lib/plugins/aws/package/index');
const AwsProvider = require('../../../../../../../lib/plugins/aws/provider');
const Serverless = require('../../../../../../../lib/Serverless');

describe('#generatePackageRuntimeMetadata()', () => {
  let serverless;
  let awsPackage;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsPackage = new AwsPackage(serverless, options);
    awsPackage.serverless.cli = new serverless.classes.CLI();
  });

  it('should generate a static name for the artifact directory', () => {
    awsPackage.generatePackageRuntimeMetadata();
    expect(awsPackage.serverless.service.package.deploymentDirectoryPrefix).to.match(/dev$/);
  });

  it('should generate a timestamp based on the current time', () => {
    awsPackage.generatePackageRuntimeMetadata();
    expect(awsPackage.serverless.service.package.timestamp).to.match(/[0-9]+-.+/);
  });
});
