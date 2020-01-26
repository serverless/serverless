'use strict';

const expect = require('chai').expect;
const AwsCompileAlbEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#getTargetId', () => {
  let awsCompileAlbEvents;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'some-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.service.functions.foo = {};

    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless);
  });

  it('should return a reference to Lambda Arn when provisionnedConcurrency is not set', () => {
    expect(awsCompileAlbEvents.getTargetId('foo')).to.deep.equal({
      'Fn::GetAtt': ['FooLambdaFunction', 'Arn'],
    });
  });

  it('should return a reference to provisioned Alias Arn when provisionnedConcurrency is set', () => {
    serverless.service.functions.foo.provisionedConcurrency = 1;
    expect(awsCompileAlbEvents.getTargetId('foo')).to.deep.equal({
      'Fn::Join': [':', [{ 'Fn::GetAtt': ['FooLambdaFunction', 'Arn'] }, 'provisioned']],
    });
  });
});
