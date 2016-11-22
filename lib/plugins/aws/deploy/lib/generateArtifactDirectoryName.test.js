'use strict';

const expect = require('chai').expect;
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('#generateArtifactDirectoryName()', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  it('should generate a name for the artifact directory based on the current time', () => awsDeploy
    .generateArtifactDirectoryName().then(() => {
      expect(awsDeploy.serverless.service.package.artifactDirectoryName).to.match(/[0-9]+-.+/);
    })
  );
});
