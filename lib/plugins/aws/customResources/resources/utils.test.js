'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
const { expect } = require('chai');
const { getLambdaArn, getEnvironment } = require('./utils');

describe('#getLambdaArn()', () => {
  it('should return the Lambda arn', () => {
    const region = 'us-east-1';
    const accountId = '123456';
    const functionName = 'some-function';
    const arn = getLambdaArn(region, accountId, functionName);

    expect(arn).to.equal('arn:aws:lambda:us-east-1:123456:function:some-function');
  });
});

describe('#getEnvironment()', () => {
  it('should return an object with information about the execution environment', () => {
    const context = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456:function:some-function',
    };
    const env = getEnvironment(context);

    expect(env).to.deep.equal({
      LambdaArn: 'arn:aws:lambda:us-east-1:123456:function:some-function',
      Region: 'us-east-1',
      AccountId: '123456',
      LambdaName: 'some-function',
    });
  });
});
