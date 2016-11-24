'use strict';

const expect = require('chai').expect;

const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../');

describe('#normalize()', () => {
  let awsDeploy;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.serverless.cli = new serverless.classes.CLI();
    awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    };
    awsDeploy.serverless.service.service = 'new-service';
    awsDeploy.serverless.service.functions = {
      myFunc: {
        name: 'test',
        artifact: 'test.zip',
        handler: 'handler.hello',
        events: [{ http: 'GET greet' }],
      },
    };
  });

  it('should not merge there are no functions', () => {
    awsDeploy.normalize();
    expect(awsDeploy.serverless.service.functions.myFunc.events[0]).to.eql(
        { http: { method: 'GET', path: 'greet' } });
  });
});
