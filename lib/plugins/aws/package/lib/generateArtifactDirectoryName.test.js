'use strict';

const expect = require('chai').expect;
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');

describe('#generateArtifactDirectoryName()', () => {
  let serverless;
  let awsPackage;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsPackage = new AwsPackage(serverless, options);
    awsPackage.serverless.cli = new serverless.classes.CLI();
  });

  it('should generate a name for the artifact directory based on the current time', () => awsPackage
    .generateArtifactDirectoryName().then(() => {
      expect(awsPackage.serverless.service.package.artifactDirectoryName).to.match(/[0-9]+-.+/);
    })
  );
});
