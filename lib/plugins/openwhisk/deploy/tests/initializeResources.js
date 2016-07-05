'use strict';

const expect = require('chai').expect;
const OpenWhiskDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('#initializeResources()', () => {
  let serverless;
  let openwhiskDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskDeploy = new OpenWhiskDeploy(serverless, options);
  });

  it('should add core resources and merge custom resources', () => {
    const mockObject = {
    };

    openwhiskDeploy.initializeResources();
    expect(openwhiskDeploy.serverless.service.resources.openwhisk).to.be.deep.equal(mockObject);
  });
});
