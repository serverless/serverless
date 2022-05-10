'use strict';

const expect = require('chai').expect;
const resolveLambdaTarget = require('../../../../../../lib/plugins/aws/utils/resolve-lambda-target');

describe('#resolveLambdaTarget', () => {
  it('should return a reference to Lambda Arn when provisionnedConcurrency is not set', () => {
    const functionObj = {};
    const functionName = 'foo';
    expect(resolveLambdaTarget(functionName, functionObj)).to.deep.equal({
      'Fn::GetAtt': ['FooLambdaFunction', 'Arn'],
    });
  });

  it('should return a reference to provisioned Alias Arn when provisionnedConcurrency is set', () => {
    const functionObj = { targetAlias: { name: 'provisioned' } };
    const functionName = 'foo';
    expect(resolveLambdaTarget(functionName, functionObj)).to.deep.equal({
      'Fn::Join': [':', [{ 'Fn::GetAtt': ['FooLambdaFunction', 'Arn'] }, 'provisioned']],
    });
  });
});
